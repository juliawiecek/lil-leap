import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import { FocusAfterChange } from './focus-after-change';
import { AccountsService } from './accounts.service';
import { AccountSummary, MAX_ACCOUNTS, TransferResult, accountLabel, canTrade } from './accounts-api';

type Dialog = 'add' | 'transfer';
type TransferStep = 'form' | 'review' | 'done';

const TRANSFER_TITLES: Record<TransferStep, string> = {
  form: 'Transfer funds',
  review: 'Review transfer',
  done: 'Transfer complete',
};

/** Same rule as the server: letters, digits, spaces and basic punctuation. */
const NICKNAME = /^[\p{L}\p{N} .,'&()-]+$/u;
const NICKNAME_MAX = 50;
const CENTS = /^\d+(\.\d{1,2})?$/;

/**
 * Header account picker (PS-05): switch which account the dashboard shows, open another
 * account, and move cash between the client's own accounts.
 */
@Component({
  selector: 'app-account-switcher',
  imports: [CurrencyPipe, DashboardIcon, FocusAfterChange],
  templateUrl: './account-switcher.html',
  styleUrl: './account-switcher.scss',
  host: {
    '(document:click)': 'closeMenuOutside($event)',
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
})
export class AccountSwitcher {
  readonly accounts = inject(AccountsService);
  readonly #host = inject(ElementRef<HTMLElement>);
  readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('accountDialog');
  readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('accountTrigger');

  readonly menuOpen = signal(false);
  readonly dialog = signal<Dialog | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  /** Confirmation read out after a dialog closes. */
  readonly notice = signal('');

  readonly nickname = signal('');
  readonly fromId = signal('');
  readonly toId = signal('');
  readonly amount = signal('');
  readonly step = signal<TransferStep>('form');
  readonly result = signal<TransferResult | null>(null);
  readonly transferTitle = computed(() => TRANSFER_TITLES[this.step()]);

  readonly selected = this.accounts.selected;
  readonly atLimit = computed(() => this.accounts.accounts().length >= MAX_ACCOUNTS);
  readonly canTransfer = computed(() => this.accounts.accounts().length > 1);
  readonly from = computed(() => this.#find(this.fromId()));
  readonly to = computed(() => this.#find(this.toId()));
  readonly destinations = computed(() => this.accounts.accounts().filter((a) => a.account_id !== this.fromId()));
  readonly label = accountLabel;
  readonly canTrade = canTrade;

  /** Settled cash that can move or trade now, as a number. */
  available(account: AccountSummary | null | undefined): number {
    return Number(account?.available_cash ?? 0);
  }

  statusLabel(account: AccountSummary): string {
    if (account.account_status === 'ACTIVE') {
      return account.trading_enabled ? '' : 'Trading off';
    }
    return account.account_status.charAt(0) + account.account_status.slice(1).toLowerCase();
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
    if (this.menuOpen()) {
      // Balances move with every fill; show current ones each time the picker opens.
      void this.accounts.refresh().catch(() => undefined);
    }
  }

  closeMenuOutside(event: Event): void {
    if (this.menuOpen() && !this.#host.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  choose(account: AccountSummary): void {
    this.accounts.select(account.account_id);
    this.menuOpen.set(false);
    this.notice.set(`Now showing ${accountLabel(account)}.`);
    this.trigger()?.nativeElement.focus({ preventScroll: true });
  }

  openAdd(): void {
    this.nickname.set('');
    this.#openDialog('add');
  }

  openTransfer(): void {
    const from = this.selected();
    this.fromId.set(from?.account_id ?? '');
    this.toId.set(this.destinations()[0]?.account_id ?? '');
    this.amount.set('');
    this.step.set('form');
    this.result.set(null);
    this.#openDialog('transfer');
  }

  setFrom(accountId: string): void {
    this.fromId.set(accountId);
    if (this.toId() === accountId) {
      this.toId.set(this.destinations()[0]?.account_id ?? '');
    }
  }

  /** Validates the nickname locally, then opens the account; the server repeats every check. */
  async submitAdd(event?: Event): Promise<void> {
    event?.preventDefault();
    const nickname = this.nickname().trim();
    const problem = nicknameProblem(nickname);
    if (problem) {
      this.error.set(problem);
      return;
    }
    await this.#run(async () => {
      const opened = await this.accounts.open(nickname);
      this.closeDialog();
      this.notice.set(`${opened.nickname} ••${opened.accountNumber.slice(-4)} is open and selected. It starts with $0.00.`);
    });
  }

  /** Checks the transfer and shows it for review; nothing moves until it is confirmed. */
  reviewTransfer(event?: Event): void {
    event?.preventDefault();
    const problem = this.#transferProblem();
    this.error.set(problem);
    if (!problem) {
      this.step.set('review');
    }
  }

  async confirmTransfer(): Promise<void> {
    if (this.step() !== 'review') {
      return;
    }
    await this.#run(async () => {
      this.result.set(await this.accounts.transfer(this.fromId(), this.toId(), Number(this.amount())));
      this.step.set('done');
    });
  }

  closeDialog(): void {
    this.dialogRef()?.nativeElement.close?.();
    this.dialog.set(null);
    this.error.set('');
  }
  dialogClosed(): void {
    this.dialog.set(null);
    this.trigger()?.nativeElement.focus({ preventScroll: true });
  }

  /** Closes when the dimmed area around the dialog is clicked. */
  backdrop(event: MouseEvent): void {
    if (event.target === this.dialogRef()?.nativeElement) {
      this.closeDialog();
    }
  }

  #openDialog(dialog: Dialog): void {
    this.menuOpen.set(false);
    this.error.set('');
    this.notice.set('');
    this.dialog.set(dialog);
    const element = this.dialogRef()?.nativeElement;
    if (element && !element.open) {
      element.showModal?.();
    }
  }

  #transferProblem(): string {
    const amount = this.amount().trim();
    if (!this.from() || !this.to() || this.fromId() === this.toId()) {
      return 'Choose two different accounts.';
    }
    if (!CENTS.test(amount) || Number(amount) <= 0) {
      return 'Enter an amount in dollars and cents, such as 250 or 250.50.';
    }
    if (Number(amount) > this.available(this.from())) {
      return 'That is more than the available cash in the account you are moving it from.';
    }
    return '';
  }

  async #run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  #find(accountId: string): AccountSummary | undefined {
    return this.accounts.accounts().find((a) => a.account_id === accountId);
  }
}

function nicknameProblem(nickname: string): string {
  if (!nickname) {
    return 'Give the account a nickname.';
  }
  if (nickname.length > NICKNAME_MAX) {
    return `Keep the nickname to ${NICKNAME_MAX} characters or fewer.`;
  }
  return NICKNAME.test(nickname) ? '' : 'Use letters, numbers, spaces and . , \' & ( ) - only.';
}
