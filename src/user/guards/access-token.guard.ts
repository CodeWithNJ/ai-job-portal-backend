import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthJwtPayload, TokenService } from '../token.service';

/**
 * Guard that authenticates requests using the HttpOnly `access_token` cookie
 * set at login. On success the decoded JWT payload is attached to the request
 * as `request.user`, where the `@CurrentUser()` decorator can pick it up.
 *
 * If the cookie is missing, malformed, or expired the guard responds with 401
 * — the frontend can react by calling `POST /users/refresh` and replaying the
 * original request, or by routing the user to the login screen.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  private static readonly ACCESS_TOKEN_COOKIE = 'access_token';

  constructor(private readonly tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthJwtPayload }>();

    const cookies = request.cookies as
      | Record<string, string | undefined>
      | undefined;
    const accessToken = cookies?.[AccessTokenGuard.ACCESS_TOKEN_COOKIE];

    if (!accessToken) {
      throw new UnauthorizedException('Not authenticated');
    }

    try {
      const payload = await this.tokenService.verifyAccessToken(accessToken);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Session has expired');
    }
  }
}
