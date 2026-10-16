import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from './jwt.service';
import { InvalidAccessTokenException } from '../user/exceptions/invalid-access-token.exception';

/** Request carrying the verified caller's user id, set by AccessTokenGuard. */
export type AuthenticatedRequest = Request & { userId: string };

/** Requires `Authorization: Bearer <access token>`; 401 otherwise, including when verification itself fails (TS-SEC-01). */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new InvalidAccessTokenException();
    }
    try {
      request.userId = this.jwtService.verifyToken(token);
    } catch {
      // Fail closed: an unexpected verifier error denies access with 401, never a pass or a 500.
      throw new InvalidAccessTokenException();
    }
    return true;
  }
}
