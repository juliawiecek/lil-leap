import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResetPasswordRequestDto } from './reset-password-request.dto';
import { ForgotPasswordRequestDto } from './forgot-password-request.dto';

/** Validates a body the way the global ValidationPipe does; returns the names of the failing fields. */
async function failingFields(type: new () => object, body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(type, body));
  return errors.map((error) => error.property);
}

describe('ResetPasswordRequestDto', () => {
  it('accepts a token and a password that meets the registration rule', async () => {
    await expect(failingFields(ResetPasswordRequestDto, { token: 'link-value', newPassword: 'pw-123456' })).resolves.toEqual([]);
  });

  it.each([
    ['too short (weak)', 'short1'],
    ['too long', 'x'.repeat(129)],
    ['not a string', 12345678],
  ])('rejects a new password that is %s', async (_case, newPassword) => {
    await expect(failingFields(ResetPasswordRequestDto, { token: 'link-value', newPassword })).resolves.toEqual(['newPassword']);
  });

  it('rejects a missing or empty token', async () => {
    await expect(failingFields(ResetPasswordRequestDto, { newPassword: 'pw-123456' })).resolves.toEqual(['token']);
    await expect(failingFields(ResetPasswordRequestDto, { token: '', newPassword: 'pw-123456' })).resolves.toEqual(['token']);
  });
});

describe('ForgotPasswordRequestDto', () => {
  it('accepts an email address', async () => {
    await expect(failingFields(ForgotPasswordRequestDto, { email: 'trader@example.com' })).resolves.toEqual([]);
  });

  it('rejects a missing or malformed email', async () => {
    await expect(failingFields(ForgotPasswordRequestDto, {})).resolves.toEqual(['email']);
    await expect(failingFields(ForgotPasswordRequestDto, { email: 'not-an-email' })).resolves.toEqual(['email']);
  });
});
