import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  Renderer2,
  ViewChild,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';

import { InvestorProfile } from './investor-profile';
import { StockDashboard, Experience } from './stock-dashboard';

type AuthMode = 'signin' | 'signup';

interface Candle {
  open: number;
  close: number;
  high: number;
  low: number;
}

interface VolumeBar {
  height: string;
  speed: string;
  delay: string;
  accent: boolean;
}

@Component({
  selector: 'app-root',
  imports: [InvestorProfile, StockDashboard],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  encapsulation: ViewEncapsulation.None,
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('marketChart', { static: true })
  private marketChart!: ElementRef<HTMLCanvasElement>;

  @ViewChild('fullName') private fullName!: ElementRef<HTMLInputElement>;
  @ViewChild('email') private email!: ElementRef<HTMLInputElement>;
  @ViewChild('password') private password!: ElementRef<HTMLInputElement>;

  private readonly renderer = inject(Renderer2);
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly candleStep = 30;
  private readonly riseColor = '#78a85f';
  private readonly neutralColor = '#eeeeee';

  readonly authMode = signal<AuthMode>('signin');
  readonly pageReady = signal(false);
  readonly profileOpen = signal(false);
  readonly dashboardOpen = signal(false);
  readonly traderLevel = signal<Experience>('NOVICE');
  readonly newAccount = signal(false);

  openDashboard(level: Experience, fresh = true): void {
    this.traderLevel.set(level);
    this.newAccount.set(fresh);
    this.profileOpen.set(false);
    this.dashboardOpen.set(true);
    this.password.nativeElement.value = '';
    this.passwordDraft.set('');
    this.confirmationDraft.set('');
    this.passwordStarted.set(false);
    const confirmation = document.getElementById('verify-password') as HTMLInputElement | null;
    if (confirmation) confirmation.value = '';
  }

  signOut(): void {
    this.dashboardOpen.set(false);
    this.applicantName.set('');
    this.applicantEmail.set('');
    this.setAuthMode('signin');
  }
  readonly applicantName = signal('');
  readonly applicantEmail = signal('');

  returnToSignup(): void {
    this.profileOpen.set(false);
    this.setAuthMode('signup');
  }
  readonly passwordVisible = signal(false);
  readonly passwordDraft = signal('');
  readonly confirmationDraft = signal('');
  readonly passwordStarted = signal(false);
  readonly passwordRules = [
    { label: 'At least 12 characters', test: (value: string) => value.length >= 12 },
    { label: 'An uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
    { label: 'A lowercase letter', test: (value: string) => /[a-z]/.test(value) },
    { label: 'A number', test: (value: string) => /[0-9]/.test(value) },
    { label: 'A symbol (such as !, @, or #)', test: (value: string) => /[^A-Za-z0-9\s]/.test(value) },
  ];

  updatePassword(value: string): void {
    this.passwordDraft.set(value);
    this.passwordStarted.set(true);
    this.formStatus.set('');
  }
  readonly formStatus = signal('');
  readonly volumeBars = signal<VolumeBar[]>([]);

  private context: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private candles: Candle[] = [];
  private reveal = this.reduceMotion ? 1 : 0.025;
  private lastFrameTime = performance.now();
  private brandStarted = false;
  private randomSeed = 918273;
  private brandTimer?: ReturnType<typeof setTimeout>;
  private focusTimer?: ReturnType<typeof setTimeout>;
  private animationFrameId = 0;

  ngAfterViewInit(): void {
    this.context = this.marketChart.nativeElement.getContext('2d');
    if (!this.context) return;

    this.buildVolumeField();
    this.resizeChart();
    this.animationFrameId = requestAnimationFrame((now) => this.animate(now));
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationFrameId);
    if (this.brandTimer) clearTimeout(this.brandTimer);
    if (this.focusTimer) clearTimeout(this.focusTimer);
    this.renderer.removeClass(document.body, 'brand-phase');
    this.renderer.removeClass(document.body, 'auth-phase');
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!this.context) return;
    this.buildVolumeField();
    this.resizeChart();
    this.drawChart();
  }

  @HostListener('window:pageshow', ['$event'])
  onPageShow(event: PageTransitionEvent): void {
    if (event.persisted) window.location.reload();
  }

  setAuthMode(mode: AuthMode): void {
    this.passwordDraft.set(this.password.nativeElement.value);
    this.confirmationDraft.set('');
    this.passwordStarted.set(!!this.password.nativeElement.value);
    this.authMode.set(mode);
    this.formStatus.set('');

    if (this.focusTimer) clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => {
      const target = mode === 'signup' ? this.fullName : this.email;
      target?.nativeElement.focus({ preventScroll: true });
    });
  }

  togglePassword(): void {
    this.passwordVisible.update((visible) => !visible);
    this.password.nativeElement.focus();
  }

  showPasswordRecovery(event: Event): void {
    event.preventDefault();
    this.formStatus.set('Password recovery will continue in the next step.');
  }

  onSubmit(event: Event, form: HTMLFormElement): void {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (this.authMode() === 'signup') {
      this.passwordDraft.set(this.password.nativeElement.value);
      this.passwordStarted.set(true);
      if (!this.passwordRules.every(rule => rule.test(this.password.nativeElement.value))) {
        this.formStatus.set('Please meet all the password requirements below.');
        this.password.nativeElement.focus();
        return;
      }
      const confirmation = form.elements.namedItem('verifyPassword') as HTMLInputElement;
      if (confirmation.value !== this.password.nativeElement.value) {
        this.formStatus.set('Passwords do not match. Please enter the same password in both fields.');
        confirmation.focus();
        return;
      }
      if (!this.fullName.nativeElement.value.trim()) {
        this.formStatus.set('Please enter your full name.');
        this.fullName.nativeElement.focus();
        return;
      }
      this.applicantName.set(this.fullName.nativeElement.value.trim());
      this.applicantEmail.set(this.email.nativeElement.value.trim());
      this.formStatus.set('');
      this.profileOpen.set(true);
      return;
    }

    this.openDashboard('NOVICE', false);
  }

  private buildVolumeField(): void {
    const barCount = Math.max(34, Math.min(72, Math.floor(window.innerWidth / 22)));
    const bars = Array.from({ length: barCount }, (_, index) => {
      const wave = (Math.sin(index * 1.73) + Math.sin(index * 0.47 + 1.8) + 2) / 4;
      const barHeight = 12 + wave * 76;

      return {
        height: `${barHeight.toFixed(1)}%`,
        speed: `${(3.2 + (index % 9) * 0.37).toFixed(2)}s`,
        delay: `${(-index * 0.19).toFixed(2)}s`,
        accent: index % 7 === 2 || index % 11 === 5,
      };
    });

    this.volumeBars.set(bars);
  }

  private showAuthPage(): void {
    if (this.pageReady()) return;
    this.pageReady.set(true);
    this.renderer.addClass(document.body, 'brand-phase');
    this.renderer.addClass(document.body, 'auth-phase');
  }

  private beginBrandTransition(): void {
    if (this.brandStarted) return;
    this.brandStarted = true;
    this.renderer.addClass(document.body, 'brand-phase');
    this.brandTimer = setTimeout(
      () => this.showAuthPage(),
      this.reduceMotion ? 0 : 1650,
    );
  }

  private resizeChart(): void {
    const canvas = this.marketChart.nativeElement;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    canvas.width = Math.round(this.width * this.dpr);
    canvas.height = Math.round(this.height * this.dpr);
    canvas.style.width = `${this.width}px`;
    canvas.style.height = `${this.height}px`;
    this.context?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.seedChart();
  }

  private random(): number {
    this.randomSeed = (this.randomSeed * 1664525 + 1013904223) >>> 0;
    return this.randomSeed / 4294967296;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private makeCandle(open: number, close: number, volatility = 0.045): Candle {
    const upperWick = 0.016 + this.random() * volatility;
    const lowerWick = 0.016 + this.random() * volatility;

    return {
      open: this.clamp(open, 0.07, 0.93),
      close: this.clamp(close, 0.07, 0.93),
      high: this.clamp(Math.max(open, close) + upperWick, 0.07, 0.96),
      low: this.clamp(Math.min(open, close) - lowerWick, 0.04, 0.93),
    };
  }

  private seedChart(): void {
    const sidePadding = Math.max(24, this.width * 0.04);
    const total = Math.floor((this.width - sidePadding * 2) / this.candleStep) + 1;
    const anchors = [
      0.08, 0.26, 0.17, 0.4, 0.29, 0.53, 0.41, 0.66, 0.53, 0.77, 0.65, 0.87,
      0.77, 0.93,
    ];

    this.randomSeed = 918273;
    this.candles = [];
    let previousClose = anchors[0];

    for (let index = 0; index < total; index += 1) {
      const progress = index / Math.max(1, total - 1);
      const anchorPosition = progress * (anchors.length - 1);
      const anchorIndex = Math.floor(anchorPosition);
      const mix = anchorPosition - anchorIndex;
      const start = anchors[anchorIndex];
      const end = anchors[Math.min(anchorIndex + 1, anchors.length - 1)];
      const target = start + (end - start) * mix;
      const open = previousClose + (this.random() - 0.5) * 0.018;
      let close = this.clamp(
        open + (target - open) * 0.92 + (this.random() - 0.5) * 0.07,
        0.07,
        0.93,
      );

      if (Math.abs(close - open) < 0.05) {
        const direction = Math.sign(target - open) || (this.random() > 0.5 ? 1 : -1);
        close = this.clamp(open + direction * (0.05 + this.random() * 0.025), 0.07, 0.93);
      }

      const volatility = 0.03 + Math.abs(end - start) * 0.1;
      const candle = this.makeCandle(open, close, volatility);
      this.candles.push(candle);
      previousClose = candle.close;
    }
  }

  private priceY(price: number): number {
    const chartHeight = Math.min(this.height * 0.78, 740);
    const top = (this.height - chartHeight) / 2;
    return top + (1 - price) * chartHeight;
  }

  private drawCandle(candle: Candle, x: number, progress = 1, opacity = 1): void {
    const context = this.context;
    if (!context) return;

    const animatedClose = candle.open + (candle.close - candle.open) * progress;
    const animatedHigh =
      Math.max(candle.open, animatedClose) +
      (candle.high - Math.max(candle.open, candle.close)) * progress;
    const animatedLow =
      Math.min(candle.open, animatedClose) -
      (Math.min(candle.open, candle.close) - candle.low) * progress;
    const color = animatedClose >= candle.open ? this.riseColor : this.neutralColor;
    const bodyWidth = Math.max(5, this.candleStep * 0.22);
    const openY = this.priceY(candle.open);
    const closeY = this.priceY(animatedClose);
    const highY = this.priceY(animatedHigh);
    const lowY = this.priceY(animatedLow);
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(8, Math.abs(closeY - openY));

    context.globalAlpha = opacity;
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, highY);
    context.lineTo(x, lowY);
    context.stroke();
    context.fillStyle = color;
    context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    context.globalAlpha = 1;
  }

  private drawChart(): void {
    const context = this.context;
    if (!context) return;

    context.clearRect(0, 0, this.width, this.height);
    context.shadowColor = 'transparent';
    const revealed = this.candles.length * this.reveal;
    const fullyVisible = Math.floor(revealed);
    const partialProgress = revealed - fullyVisible;
    const startX = Math.max(24, this.width * 0.04);

    for (let index = 0; index < fullyVisible; index += 1) {
      const x = startX + index * this.candleStep;
      const edgeFade = this.clamp(x / 90, 0.18, 1);
      this.drawCandle(this.candles[index], x, 1, edgeFade);
    }

    if (fullyVisible < this.candles.length) {
      const x = startX + fullyVisible * this.candleStep;
      this.drawCandle(this.candles[fullyVisible], x, partialProgress, partialProgress);
    }
  }

  private animate(now: number): void {
    const delta = Math.min(now - this.lastFrameTime, 32);
    this.lastFrameTime = now;

    if (this.reveal < 1) {
      this.reveal = Math.min(1, this.reveal + delta / 2500);
    }

    if (!this.brandStarted && this.reveal >= 0.68) {
      this.beginBrandTransition();
    }

    this.drawChart();
    if (!this.pageReady()) {
      this.animationFrameId = requestAnimationFrame((nextFrame) => this.animate(nextFrame));
    }
  }
}
