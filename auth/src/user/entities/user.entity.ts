import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type UserRole = 'TRADER' | 'ANALYST' | 'OPERATIONS';

/** BR-03: only ACTIVE users may sign in or refresh a session. DISABLED covers expired and compromised users. */
export type UserStatus = 'ACTIVE' | 'DISABLED' | 'DELETED';

/** Auth-only user record -- identity/financial detail lives in the onboarding entities. */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid', { name: 'user_id' })
  userId: string;

  @Column({ name: 'email', length: 255 })
  email: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ name: 'user_role', length: 20, default: 'TRADER' })
  userRole: UserRole;

  @Column({ name: 'user_status', length: 20, default: 'ACTIVE' })
  userStatus: UserStatus;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  /** BR-03: when the current password was set; sign-in is refused once it is older than the policy allows. */
  @Column({ name: 'password_changed_at', type: 'timestamptz' })
  passwordChangedAt: Date;

  /** When the one "expires soon" email for the current password went out; null until it does. */
  @Column({ name: 'password_expiry_warned_at', type: 'timestamptz', nullable: true })
  passwordExpiryWarnedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
