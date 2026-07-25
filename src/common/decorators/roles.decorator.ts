import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../user/dto/create-user.dto';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given user roles. Must be used together with
 * `AccessTokenGuard` (which authenticates the request and attaches the JWT
 * payload as `request.user`) followed by `RolesGuard`:
 *
 *   @UseGuards(AccessTokenGuard, RolesGuard)
 *   @Roles(UserRole.JOB_SEEKER)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
