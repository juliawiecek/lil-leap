import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A pending password reset. The table allows one row per user, so a new request replaces the old one.
 * user_id is a plain column (the FK lives in the schema) so the row can be locked without a join.
 */
@Entity({ name: 'password_reset_tokens' })
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid', { name: 'reset_token_id' })
  resetTokenId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** SHA-256 hash of the raw token -- the raw value only ever leaves the service inside the reset link. */
  @Column({ name: 'token_hash', length: 512 })
  tokenHash: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
