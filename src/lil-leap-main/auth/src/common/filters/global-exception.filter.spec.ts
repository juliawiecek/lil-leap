import { BadRequestException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
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
});
