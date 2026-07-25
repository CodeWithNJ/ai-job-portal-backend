import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthJwtPayload } from '../token.service';

/**
 * Resolves the authenticated user attached to the request by
 * `AccessTokenGuard`. Use without arguments to get the full payload, or pass
 * a key (e.g. `@CurrentUser('sub')`) to pluck a single claim.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthJwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthJwtPayload }>();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    return data ? user[data] : user;
  },
);
