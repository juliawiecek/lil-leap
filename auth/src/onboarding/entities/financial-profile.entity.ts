import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { EmploymentStatus } from '../enums/employment-status.enum';
import { NetWorthBracket } from '../enums/net-worth-bracket.enum';
import { RiskProfile } from '../enums/risk-profile.enum';

/** Financial and regulatory onboarding profile for a user. */
@Entity({ name: 'financial_profiles' })
export class FinancialProfile {
  @PrimaryGeneratedColumn('uuid', { name: 'financial_profile_id' })
  financialProfileId: string;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'kyc_status', length: 30, default: 'PENDING' })
  kycStatus: string;

  @Column({ name: 'accredited_investor', default: false })
  accreditedInvestor: boolean;

  // Stored as the dollar-range string ("$0-5k") directly, matching the DB's
  // chk_net_worth_bracket constraint -- not an enum-name column.
  @Column({ name: 'net_worth_bracket', length: 30, nullable: true })
  netWorthBracket: NetWorthBracket | null;

  @Column({ name: 'risk_profile', length: 30, nullable: true })
  riskProfile: RiskProfile | null;

  @Column({ name: 'employment_status', length: 50, nullable: true })
  employmentStatus: EmploymentStatus | null;

  @Column({ name: 'employer_name', length: 255, nullable: true })
  employerName: string | null;

  @Column({ name: 'occupation', length: 100, nullable: true })
  occupation: string | null;

  @Column({ name: 'annual_income', type: 'numeric', precision: 18, scale: 2, nullable: true })
  annualIncome: string | null;

  @Column({ name: 'liquidity_position', length: 100, nullable: true })
  liquidityPosition: string | null;

  @Column({ name: 'is_politically_exposed_person', default: false })
  politicallyExposedPerson: boolean;

  @Column({ name: 'regulatory_disclosures', type: 'jsonb', nullable: true })
  regulatoryDisclosures: string | null;

  @Column({ name: 'beneficial_owner_info', type: 'jsonb', nullable: true })
  beneficialOwnerInfo: string | null;

  @Column({ name: 'funds_source_verified', default: false })
  fundsSourceVerified: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
