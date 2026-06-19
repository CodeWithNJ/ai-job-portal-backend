import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto, UserRole } from './dto/create-user.dto';
import { PrismaService } from 'src/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login-user.dto';
import { RefreshJwtPayload, TokenService } from './token.service';
import { EncryptionService } from '../common/services/encryption.service';

export interface AuthenticatedUserSummary {
  id: string;
  email: string;
  role: UserRole;
  lastLoginAt: Date | null;
}

export interface LoginResult {
  user: AuthenticatedUserSummary;
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
  accessTokenExpiresInMs: number;
  refreshTokenExpiresInMs: number;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private static readonly BCRYPT_SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async createNewUser(createUserDto: CreateUserDto) {
    const { email, contactNo, role, password } = createUserDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException(
        `Account already exists with this email: ${email}`,
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      UserService.BCRYPT_SALT_ROUNDS,
    );

    const user = await this.prisma.user.create({
      data: {
        email,
        contactNo,
        passwordHash: hashedPassword,
        role,
      },
      select: {
        id: true,
        email: true,
        contactNo: true,
        role: true,
        isAccountActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.logger.log(`New user created: ${user.id}`);
    return user;
  }

  async loginUser(loginUserDto: LoginUserDto): Promise<LoginResult> {
    const { email, password, rememberMe } = loginUserDto;

    const userFound = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        passwordHash: true,
        isAccountActive: true,
      },
    });

    // Use a uniform error for "missing user" and "wrong password" so the API
    // does not become an account-enumeration oracle.
    if (!userFound) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!userFound.isAccountActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    const passwordMatches = await bcrypt.compare(
      password,
      userFound.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.tokenService.issueTokens(
      {
        sub: userFound.id,
        _id: userFound.id,
        email: userFound.email,
        role: userFound.role as UserRole,
      },
      { rememberMe: Boolean(rememberMe) },
    );

    const updatedUser = await this.persistRefreshToken(
      userFound.id,
      tokens.refreshToken,
      { touchLastLoginAt: true },
    );

    this.logger.log(
      `User logged in: ${updatedUser.id} (rememberMe=${tokens.rememberMe})`,
    );

    return {
      user: updatedUser,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      rememberMe: tokens.rememberMe,
      accessTokenExpiresInMs: tokens.accessTokenExpiresInMs,
      refreshTokenExpiresInMs: tokens.refreshTokenExpiresInMs,
    };
  }

  /**
   * Verifies the presented refresh token, confirms it matches the encrypted
   * copy stored for that user (rotation / reuse detection), then issues a
   * fresh access + refresh pair. The original "Keep me signed in" choice is
   * preserved by reading the `rememberMe` claim off the refresh JWT.
   */
  async refreshSession(presentedRefreshToken: string): Promise<LoginResult> {
    let payload: RefreshJwtPayload;
    try {
      payload = await this.tokenService.verifyRefreshToken(
        presentedRefreshToken,
      );
    } catch {
      throw new UnauthorizedException(
        'Session has expired. Please sign in again.',
      );
    }

    const userFound = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isAccountActive: true,
        refreshToken: true,
      },
    });

    if (!userFound || !userFound.refreshToken) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    if (!userFound.isAccountActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    const tokenMatches = this.encryptionService.matches(
      presentedRefreshToken,
      userFound.refreshToken,
    );

    if (!tokenMatches) {
      // The presented token verified cryptographically but doesn't match the
      // stored copy — most likely it was a previously-rotated token being
      // replayed. Treat this as a potential compromise and revoke the active
      // session so the attacker (and the legitimate user) must re-authenticate.
      await this.prisma.user
        .update({
          where: { id: userFound.id },
          data: { refreshToken: null },
        })
        .catch(() => undefined);

      this.logger.warn(
        `Refresh token mismatch for user ${userFound.id} — session revoked`,
      );
      throw new UnauthorizedException('Session is no longer valid');
    }

    const tokens = await this.tokenService.issueTokens(
      {
        sub: userFound.id,
        _id: userFound.id,
        email: userFound.email,
        role: userFound.role as UserRole,
      },
      { rememberMe: payload.rememberMe ?? false },
    );

    const updatedUser = await this.persistRefreshToken(
      userFound.id,
      tokens.refreshToken,
      { touchLastLoginAt: false },
    );

    this.logger.log(`Session refreshed: ${updatedUser.id}`);

    return {
      user: updatedUser,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      rememberMe: tokens.rememberMe,
      accessTokenExpiresInMs: tokens.accessTokenExpiresInMs,
      refreshTokenExpiresInMs: tokens.refreshTokenExpiresInMs,
    };
  }

  /**
   * Returns the authenticated user's profile. Used by the frontend on app boot
   * to rehydrate session state from the HttpOnly access cookie.
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        contactNo: true,
        role: true,
        isAccountActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Account not found');
    }

    if (!user.isAccountActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    return user;
  }

  /**
   * Revokes the server-side refresh token for the user whose refresh JWT was
   * presented. Cookie clearing is the controller's responsibility; this method
   * is intentionally idempotent so that "logout while already logged out" or
   * "logout with an expired token" both succeed silently.
   */
  async logout(presentedRefreshToken: string | undefined): Promise<void> {
    if (!presentedRefreshToken) {
      return;
    }

    let payload: RefreshJwtPayload;
    try {
      payload = await this.tokenService.verifyRefreshToken(
        presentedRefreshToken,
      );
    } catch {
      // Token is invalid/expired — nothing to revoke server-side.
      return;
    }

    await this.prisma.user
      .update({
        where: { id: payload.sub },
        data: { refreshToken: null },
      })
      .catch(() => undefined);

    this.logger.log(`User logged out: ${payload.sub}`);
  }

  private async persistRefreshToken(
    userId: string,
    plaintextRefreshToken: string,
    options: { touchLastLoginAt: boolean },
  ): Promise<AuthenticatedUserSummary> {
    const encryptedRefreshToken = this.encryptionService.encrypt(
      plaintextRefreshToken,
    );

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: encryptedRefreshToken,
        ...(options.touchLastLoginAt ? { lastLoginAt: new Date() } : {}),
      },
      select: {
        id: true,
        email: true,
        role: true,
        lastLoginAt: true,
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role as UserRole,
      lastLoginAt: updated.lastLoginAt,
    };
  }
}
