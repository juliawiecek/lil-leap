import { BadRequestException, HttpException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { ProfileNotFoundException } from '../../user/exceptions/profile-not-found.exception';
import { ProfileAccessDeniedException } from '../../user/exceptions/profile-access-denied.exception';
import { InitialDepositBelowMinimumException } from '../../onboarding/exceptions/initial-deposit-below-minimum.exception';
import { InvalidCredentialsException } from '../../user/exceptions/invalid-credentials.exception';
import { InvalidRefreshTokenException } from '../../user/exceptions/invalid-refresh-token.exception';
import { UserAlreadyExistsException } from '../../user/exceptions/user-already-exists.exception';

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  function run(exception: unknown): { status: number; body: unknown } {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => response }) } as any;
    filter.catch(exception, host);
    return { status: response.status.mock.calls[0][0], body: response.json.mock.calls[0][0] };
  }

  it.each([
    [new UserAlreadyExistsException(), 409, 'USER_ALREADY_EXISTS'],
    [new InvalidCredentialsException(), 401, 'INVALID_CREDENTIALS'],
    [new InvalidRefreshTokenException(), 401, 'INVALID_REFRESH_TOKEN'],
  ])('maps %p to its status and code', (exception, status, code) => {
    expect(run(exception)).toEqual({ status, body: { error: code, message: exception.message } });
  });

  it('keeps validation errors generic', () => {
    expect(run(new BadRequestException('password must be longer than 8'))).toEqual({
      status: 400,
      body: { error: 'INVALID_REQUEST', message: 'The request contains invalid or missing fields.' },
    });
  });

  it('never echoes an unexpected error message', () => {
    expect(run(new Error('ssn=123-45-6789'))).toEqual({
      status: 500,
      body: { error: 'INTERNAL_ERROR', message: 'The request could not be completed.' },
    });
  });

  it.each([
    [new ProfileNotFoundException(), 404, 'PROFILE_NOT_FOUND', 'No profile exists for this user.'],
    [new ProfileAccessDeniedException(), 403, 'PROFILE_ACCESS_DENIED', new ProfileAccessDeniedException().message],
    [
      new InitialDepositBelowMinimumException(),
      422,
      'INITIAL_DEPOSIT_BELOW_MINIMUM',
      'The initial deposit must be at least $5,000 for your trader tier',
    ],
    [
      new InitialDepositBelowMinimumException('100,000'),
      422,
      'INITIAL_DEPOSIT_BELOW_MINIMUM',
      'The initial deposit must be at least $100,000 for your trader tier',
    ],
  ])('maps %p with its own message', (exception, status, code, message) => {
    expect(run(exception)).toEqual({ status, body: { error: code, message } });
  });

  it('keeps the status of a non-validation HttpException but not its message', () => {
    expect(run(new NotFoundException('/internal/admin/users/42 does not exist'))).toEqual({
      status: 404,
      body: { error: 'REQUEST_FAILED', message: 'The request could not be completed.' },
    });
    expect(run(new HttpException('rate limited for 10.0.0.7', HttpStatus.TOO_MANY_REQUESTS))).toEqual({
      status: 429,
      body: { error: 'REQUEST_FAILED', message: 'The request could not be completed.' },
    });
  });

  it('logs only the exception type of an unexpected error, never its message', () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    class DatabaseDownError extends Error {}

    run(new DatabaseDownError('password=hunter2'));

    expect(errorSpy).toHaveBeenCalledWith('Request failed exceptionType=DatabaseDownError');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('hunter2');
    errorSpy.mockRestore();
  });

  it.each([
    ['null', null, 'Unknown'],
    ['undefined', undefined, 'Unknown'],
    ['a prototype-less object', Object.create(null), 'Unknown'],
    ['a thrown string', 'boom', 'String'],
  ])('answers 500 for %s and logs a safe type name', (_label, thrown, typeName) => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    expect(run(thrown)).toEqual({
      status: 500,
      body: { error: 'INTERNAL_ERROR', message: 'The request could not be completed.' },
    });
    expect(errorSpy).toHaveBeenCalledWith(`Request failed exceptionType=${typeName}`);
    errorSpy.mockRestore();
  });
});
