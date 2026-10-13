/** Injection token for the active PasswordResetDelivery; inject this, never a concrete sender. */
export const PASSWORD_RESET_DELIVERY = 'PASSWORD_RESET_DELIVERY';

/**
 * Hands a reset link to the user. The VM has no network, so the default writes to a local
 * outbox (FileOutboxDelivery); an SMTP sender can be added later behind this same interface (NEXT-219).
 */
export interface PasswordResetDelivery {
  send(email: string, resetLink: string): Promise<void>;
}
