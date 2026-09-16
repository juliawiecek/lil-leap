import { Component, computed, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';

@Component({
  selector: 'app-novice-learn',
  imports: [DashboardIcon, CurrencyPipe],
  templateUrl: './novice-learn.html',
  styleUrl: './novice-hubs.scss',
})
export class NoviceLearn {
  readonly topic = signal('All topics');
  readonly active = signal(0);
  readonly answer = signal<number | null>(null);
  readonly completed = signal<number[]>(this.loadProgress());
  readonly initial = signal(1000);
  readonly years = signal(10);
  readonly rate = signal(5);
  readonly future = computed(() => this.initial() * Math.pow(1 + this.rate() / 100, this.years()));
  readonly lessons = [
    {
      title: 'What owning a stock means',
      topic: 'Foundations',
      time: '2 min',
      icon: 'chart',
      summary: 'Shares, ownership, returns, and the possibility of loss.',
      paragraphs: [
        'A stock represents an ownership stake in a company. Shareholders may benefit if the share price rises or the company pays dividends. Neither outcome is guaranteed.',
        'The price can fall, and a company can reduce or stop dividends. Owning a familiar brand does not remove investment risk. Connect any investment to your goals and the time you can leave the money invested.',
      ],
      example:
        'If you buy 2 shares at $50, the purchase value is $100 before fees. At $45 per share, those shares are worth $90.',
      question: 'What does buying a stock give you?',
      choices: [
        'A guaranteed interest payment',
        'An ownership stake in a company',
        'Protection from any loss',
      ],
      correct: 1,
      explanation: 'A share represents ownership. Its value and any dividends can change.',
      source:
        'https://www.investor.gov/introduction-investing/investing-basics/investment-products/stocks',
      sourceName: 'Investor.gov · Stocks',
    },
    {
      title: 'Risk, diversification, and time',
      topic: 'Managing risk',
      time: '2 min',
      icon: 'shield',
      summary: 'Build an understanding of concentration and your time horizon.',
      paragraphs: [
        'Diversification spreads investments across different holdings or asset classes. It can reduce reliance on one investment, but it cannot eliminate the risk of losing money.',
        'Your time horizon is when you expect to need the money. Your risk tolerance is how much uncertainty and loss you can accept. Those considerations help frame an investment mix.',
      ],
      example:
        'Five stocks from one industry can still leave your portfolio heavily exposed to the same conditions.',
      question: 'What can diversification do?',
      choices: [
        'Reduce concentration risk',
        'Guarantee a positive return',
        'Prevent all market losses',
      ],
      correct: 0,
      explanation:
        'Diversification can reduce concentration, but broad market declines can still affect a portfolio.',
      source: 'https://www.investor.gov/introduction-investing/getting-started/asset-allocation',
      sourceName: 'Investor.gov · Asset allocation and diversification',
    },
    {
      title: 'Market orders and limit orders',
      topic: 'Placing orders',
      time: '2 min',
      icon: 'orders',
      summary: 'Learn the trade-off between execution and price control.',
      paragraphs: [
        'A market order seeks execution at the next available price. The execution price can differ from the last quote, especially when prices move quickly.',
        'A buy limit order sets the highest price you will pay. A sell limit sets the lowest price you will accept. A limit order may remain unfilled. Check the side, symbol, quantity, and order type before confirming.',
      ],
      example:
        'A buy limit of $50 can execute at $50 or lower. If available prices stay above $50, it may not execute.',
      question: 'What does a buy limit order control?',
      choices: ['The exact time it fills', 'The maximum price you will pay', 'A guaranteed profit'],
      correct: 1,
      explanation: 'A buy limit caps the execution price; it does not guarantee execution.',
      source:
        'https://www.investor.gov/introduction-investing/investing-basics/how-stock-markets-work/types-orders',
      sourceName: 'Investor.gov · Types of orders',
    },
    {
      title: 'Fees and the cost of investing',
      topic: 'Managing risk',
      time: '2 min',
      icon: 'search',
      summary: 'Find the costs that can reduce what you keep.',
      paragraphs: [
        'Investment costs can include transaction charges and account fees. A zero-commission trade does not mean every part of investing is free.',
        'Fees reduce the amount you keep invested. Read your broker?s fee schedule and compare one-time charges with recurring account costs.',
      ],
      example: 'A $5 transaction fee on a $1,000 stock purchase adds 0.5% to the purchase cost.',
      question: 'Which cost may recur in a brokerage account?',
      choices: [
        'An account maintenance fee',
        'Only the first purchase price',
        'A guaranteed capital gain',
      ],
      correct: 0,
      explanation: 'Some brokers charge recurring account fees. Review the broker?s fee schedule.',
      source:
        'https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/updated',
      sourceName: 'Investor.gov · How fees affect your portfolio',
    },
    {
      title: 'How compounding works',
      topic: 'Foundations',
      time: '2 min',
      icon: 'learn',
      summary: 'Explore growth on both the starting amount and prior growth.',
      paragraphs: [
        'Compounding occurs when returns themselves can earn additional returns. Time and reinvestment can influence the result.',
        'The calculator below shows the arithmetic of a constant annual rate. Real investment returns vary and can be negative. It excludes deposits, withdrawals, fees, and taxes.',
      ],
      example:
        'At a constant 5% annual rate, $100 becomes $105 after one year and $110.25 after two years.',
      question: 'What makes growth compound?',
      choices: [
        'Earning returns only on the starting amount',
        'Avoiding all fees automatically',
        'Earning returns on prior returns too',
      ],
      correct: 2,
      explanation:
        'Compounding includes growth on accumulated returns as well as the original amount.',
      source:
        'https://www.investor.gov/introduction-investing/investing-basics/glossary/compound-interest',
      sourceName: 'Investor.gov · Compound interest',
    },
  ];
  readonly filtered = computed(() =>
    this.lessons
      .map((lesson, index) => ({ ...lesson, index }))
      .filter((l) => this.topic() === 'All topics' || l.topic === this.topic()),
  );
  readonly current = computed(() => this.lessons[this.active()]);
  readonly glossary = [
    { term: 'Share', definition: 'A unit of ownership in a company.' },
    { term: 'Dividend', definition: 'A distribution a company may pay to shareholders.' },
    { term: 'Time horizon', definition: 'The time until you expect to need invested money.' },
    { term: 'Limit order', definition: 'An order to buy or sell at a specified price or better.' },
  ];
  selectLesson(index: number): void {
    this.active.set(index);
    this.answer.set(null);
  }
  setTopic(topic: string): void {
    this.topic.set(topic);
    if (topic !== 'All topics' && this.current().topic !== topic) {
      this.selectLesson(this.filtered()[0].index);
    }
  }
  finish(): void {
    if (this.answer() !== this.current().correct) return;
    this.completed.update((list) =>
      list.includes(this.active()) ? list : [...list, this.active()],
    );
    try {
      localStorage.setItem('nexttrade-learning-v2', JSON.stringify(this.completed()));
    } catch {}
  }
  private loadProgress(): number[] {
    try {
      const saved = JSON.parse(localStorage.getItem('nexttrade-learning-v2') || '[]');
      return Array.isArray(saved)
        ? saved.filter(
            (i: unknown) => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < 5,
          )
        : [];
    } catch {
      return [];
    }
  }
}
