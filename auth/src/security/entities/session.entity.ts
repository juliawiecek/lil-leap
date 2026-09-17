import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';

/** A refresh-token session -- the persisted, revocable half of the auth flow (access tokens are stateless JWTs). */
@Entity({ name: 'sessions' })
export class Session {
  @PrimaryGeneratedColumn('uuid', { name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** SHA-256 hash of the raw token -- the raw value is returned once, at issuance, and never persisted. */
  @Column({ name: 'token_hash', length: 512 })
  tokenHash: string;

  @CreateDateColumn({ name: 'issued_at' })
  issuedAt: Date;

  @Column({ name: 'last_active_at', type: 'timestamptz', nullable: true })
  lastActiveAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** Whether this session can still be redeemed for a new access token. */
  isActive(): boolean {
    return this.revokedAt == null && this.expiresAt.getTime() > Date.now();
  }
}
