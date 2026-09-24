import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from './jwt.service';
import { InvalidAccessTokenException } from '../user/exceptions/invalid-access-token.exception';

/** Request carrying the verified caller's user id, set by AccessTokenGuard. */
export type AuthenticatedRequest = Request & { userId: string };

/** Requires `Authorization: Bearer <access token>`; 401 otherwise. */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new InvalidAccessTokenException();
    }
    request.userId = this.jwtService.verifyToken(token);
    return true;
  }
}
