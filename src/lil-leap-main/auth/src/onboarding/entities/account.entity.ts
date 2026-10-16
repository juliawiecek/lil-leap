import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { AccountType } from '../enums/account-type.enum';
import { TraderLevel } from '../enums/trader-level.enum';

/** Trading account metadata created during onboarding. */
@Entity({ name: 'accounts' })
export class Account {
  @PrimaryGeneratedColumn('uuid', { name: 'account_id' })
  accountId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'account_number', length: 30 })
  accountNumber: string;

  @Column({ name: 'account_name', length: 100 })
  accountName: string;

  @Column({ name: 'account_type', length: 30 })
  accountType: AccountType;

  @Column({ name: 'account_status', length: 20, default: 'PENDING' })
  accountStatus: string;

  @Column({ name: 'trader_level', length: 20 })
  traderLevel: TraderLevel;

  @Column({ name: 'min_balance_requirement', type: 'numeric', precision: 18, scale: 2 })
  minBalanceRequirement: string;

  @Column({ name: 'trading_enabled', default: false })
  tradingEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
