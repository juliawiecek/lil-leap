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

import { AuthApiError } from './auth-api';
import { AuthService } from './auth.service';
import { InvestorProfile } from './investor-profile';
import { toTraderRegistration } from './registration-payload';
import { SESSION_INACTIVITY_MINUTES, SessionKeeper } from './session-keeper';
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
  private readonly auth = inject(AuthService);
  private readonly session = new SessionKeeper(this.auth, () => this.onSessionExpired());
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly riseColor = '#87bb66';
  private readonly neutralColor = '#c4cbbf';

  readonly authMode = signal<AuthMode>('signin');
  readonly pageReady = signal(false);
  // Decorative login chart; independent of the opening animation and market data.
  readonly loginCandles = Array.from({ length: 44 }, (_, index) => {
    const progress = index / 43;
    const priceAt = (step: number) => 440 - 340 * (step / 43)
      + Math.sin(step * 0.63) * 35 + Math.sin(step * 1.81) * 12;
    const close = priceAt(index);
    const open = priceAt(index - 1);
    return {
      x: 10 + index * 9.2,
      high: Math.min(open, close) - 6 - (index * 7 % 17),
      low: Math.max(open, close) + 5 + (index * 11 % 14),
      top: Math.min(open, close),
      height: Math.max(3, Math.abs(open - close)),
      falling: open < close,
      opacity: (0.15 + (Math.sin(index * 2.41 + 0.8) + 1) * 0.3) * (0.65 + progress * 0.35),
    };
  });
  readonly profileOpen = signal(false);
  readonly dashboardOpen = signal(false);
  readonly traderLevel = signal<Experience>('NOVICE');
  readonly newAccount = signal(false);
  readonly signingIn = signal(false);
  readonly registering = signal(false);
  readonly registrationError = signal('');

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
    this.session.stop();
    void this.auth.logout();
    this.dashboardOpen.set(false);
    this.applicantName.set('');
    this.applicantEmail.set('');
    this.setAuthMode('signin');
  }
  readonly applicantName = signal('');
  readonly applicantEmail = signal('');

  returnToSignup(): void {
    this.registrationError.set('');
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
  private chartMorph = 0;
  private lastFrameTime = performance.now();
  private randomSeed = 918273;
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

    void this.signIn();
  }

  private async signIn(): Promise<void> {
    if (this.signingIn()) return;
    this.signingIn.set(true);
    this.formStatus.set('');
    try {
      await this.auth.login(this.email.nativeElement.value, this.password.nativeElement.value);
      this.session.start();
      this.openDashboard(this.auth.traderLevel ?? 'NOVICE', false);
    } catch (error) {
      this.formStatus.set(this.messageFor(error));
    } finally {
      this.signingIn.set(false);
    }
  }

  /** Registration issues no tokens, so a successful sign-up signs in with the same credentials. */
  async completeRegistration(answers: Record<string, string>): Promise<void> {
    if (this.registering()) return;
    this.registering.set(true);
    this.registrationError.set('');
    const email = this.applicantEmail();
    const password = this.password.nativeElement.value;
    try {
      await this.auth.register(toTraderRegistration(answers, email, password));
      await this.auth.login(email, password);
      this.session.start();
      // The tier is assigned by the server; the token is the source of truth.
      this.openDashboard(this.auth.traderLevel ?? 'NOVICE');
    } catch (error) {
      this.registrationError.set(this.messageFor(error));
    } finally {
      this.registering.set(false);
    }
  }

  /** Any input while signed in counts as activity for the inactivity timeout. */
  @HostListener('document:pointerdown')
  @HostListener('document:keydown')
  @HostListener('document:wheel')
  @HostListener('document:touchstart')
  onUserActivity(): void {
    this.session.recordActivity();
  }

  private onSessionExpired(): void {
    this.signOut();
    this.formStatus.set(`You were signed out after ${SESSION_INACTIVITY_MINUTES} minutes of inactivity.`);
  }

  private messageFor(error: unknown): string {
    return error instanceof AuthApiError ? error.userMessage : 'Something went wrong. Please try again.';
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
    this.renderer.addClass(document.body, 'auth-phase');
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
    const total = this.loginCandles.length;
    const anchors = [
      0.08, 0.25, 0.17, 0.40, 0.29, 0.62, 0.45, 0.86, 0.60, 0.87,
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

      if (Math.abs(close - open) < 0.035) {
        const direction = Math.sign(target - open) || (this.random() > 0.5 ? 1 : -1);
        close = this.clamp(open + direction * (0.035 + this.random() * 0.025), 0.07, 0.93);
      }

      const volatility = 0.03 + Math.abs(end - start) * 0.1;
      const candle = this.makeCandle(open, close, volatility);
      this.candles.push(candle);
      previousClose = candle.close;
    }
  }

  private priceY(price: number): number {
    const chartHeight = Math.min(this.height * 0.63, 660);
    const top = this.height * 0.22;
    return top + (1 - price) * chartHeight;
  }

  private get candleStep(): number {
    return (this.width * 0.8 - Math.max(24, this.width * 0.035)) / (this.loginCandles.length - 1);
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
    const bodyWidth = Math.max(2, Math.min(10, this.candleStep * 0.32));
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
    const rising = animatedClose >= candle.open;
    const highlighted = rising && Math.floor(x / this.candleStep) % 6 === 2;
    context.shadowColor = rising ? 'rgba(125, 180, 90, 0.3)' : 'transparent';
    context.shadowBlur = highlighted ? 5 : 0;
    context.fillStyle = color;
    context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    if (highlighted) {
      context.fillStyle = '#aed08e';
      context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, Math.min(3, bodyHeight));
    }
    context.shadowBlur = 0;
    context.shadowColor = 'transparent';
    context.globalAlpha = 1;
  }

  private drawChart(): void {
    const context = this.context;
    if (!context) return;

    context.clearRect(0, 0, this.width, this.height);
    context.shadowColor = 'transparent';
    if (this.chartMorph > 0) {
      this.drawChartMorph();
      return;
    }
    const revealed = this.candles.length * this.reveal;
    const fullyVisible = Math.floor(revealed);
    const partialProgress = revealed - fullyVisible;
    const startX = Math.max(24, this.width * 0.035);

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

  private drawChartMorph(): void {
    const context = this.context;
    if (!context) return;
    // Smoothstep settles with zero velocity at both ends. The final geometry
    // matches the login SVG, so fading between the renderers does not jump.
    const t = this.chartMorph ** 2 * (3 - 2 * this.chartMorph);
    const mix = (from: number, to: number) => from + (to - from) * t;
    const mobile = this.width <= 900;
    const left = mobile ? 5 : 10;
    const scaleX = (mobile ? this.width - 10 : (this.width - 20) * 0.6) / 420;
    const scaleY = (mobile ? 340 : this.height - 49) / 500;
    const startX = Math.max(24, this.width * 0.035);
    const introWidth = Math.max(2, Math.min(10, this.candleStep * 0.32));
    for (let index = 0; index < this.candles.length; index += 1) {
      const candle = this.candles[index];
      const target = this.loginCandles[index];
      const x = mix(startX + index * this.candleStep, left + target.x * scaleX);
      const top = mix(Math.min(this.priceY(candle.open), this.priceY(candle.close)), 39 + target.top * scaleY);
      const height = mix(Math.max(8, Math.abs(this.priceY(candle.close) - this.priceY(candle.open))), target.height * scaleY);
      const width = mix(introWidth, 3.6 * scaleX);
      const fromColor = candle.close >= candle.open ? [135, 187, 102] : [196, 203, 191];
      const toColor = target.falling ? [75, 91, 66] : [127, 164, 89];
      const color = `rgb(${fromColor.map((value, channel) => Math.round(mix(value, toColor[channel]))).join(',')})`;
      context.globalAlpha = mix(this.clamp((startX + index * this.candleStep) / 90, 0.18, 1), target.opacity);
      context.strokeStyle = color;
      context.lineWidth = mix(1, 0.4 * scaleX);
      context.beginPath();
      context.moveTo(x, mix(this.priceY(candle.high), 39 + target.high * scaleY));
      context.lineTo(x, mix(this.priceY(candle.low), 39 + target.low * scaleY));
      context.stroke();
      context.fillStyle = color;
      context.fillRect(x - width / 2, top, width, height);
    }
    context.globalAlpha = 1;
  }

  private animate(now: number): void {
    const delta = Math.min(now - this.lastFrameTime, 32);
    this.lastFrameTime = now;

    if (this.reveal < 1) {
      this.reveal = Math.min(1, this.reveal + delta / 2500);
    } else {
      this.chartMorph = this.reduceMotion ? 1 : Math.min(1, this.chartMorph + delta / 1500);
    }

    if (!this.pageReady() && this.chartMorph >= 1) {
      this.showAuthPage();
    }

    this.drawChart();
    if (!this.pageReady()) {
      this.animationFrameId = requestAnimationFrame((nextFrame) => this.animate(nextFrame));
    }
  }
}
