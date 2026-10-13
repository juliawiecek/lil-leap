import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';
import { InvalidPasswordResetTokenException } from './invalid-password-reset-token.exception';

describe('PasswordResetController', () => {
  let controller: PasswordResetController;
  let service: { requestReset: jest.Mock; resetPassword: jest.Mock };

  beforeEach(async () => {
    service = { requestReset: jest.fn(), resetPassword: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [PasswordResetController],
      providers: [{ provide: PasswordResetService, useValue: service }],
    }).compile();
    controller = module.get(PasswordResetController);
  });

  it('forgot-password hands the email to the service and answers 202', async () => {
    await expect(controller.forgotPassword({ email: 'trader@example.com' })).resolves.toBeUndefined();

    expect(service.requestReset).toHaveBeenCalledWith('trader@example.com');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, PasswordResetController.prototype.forgotPassword)).toBe(HttpStatus.ACCEPTED);
  });

  it('reset-password passes the token and new password through and answers 204', async () => {
    await controller.resetPassword({ token: 'link-value', newPassword: 'brand-new-password' });

    expect(service.resetPassword).toHaveBeenCalledWith('link-value', 'brand-new-password');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, PasswordResetController.prototype.resetPassword)).toBe(HttpStatus.NO_CONTENT);
  });

  it('reset-password lets an invalid token surface as INVALID_RESET_TOKEN', async () => {
    service.resetPassword.mockRejectedValue(new InvalidPasswordResetTokenException());

    await expect(controller.resetPassword({ token: 'stale', newPassword: 'brand-new-password' })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      code: 'INVALID_RESET_TOKEN',
    });
  });
});
