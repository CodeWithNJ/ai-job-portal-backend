import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { UserRole } from './dto/create-user.dto';
import { parseExpiryToSeconds } from 'src/common/utils/parse-expiry';

export interface AuthJwtPayload {
  /** Standard JWT subject claim — also the user's UUID. */
  sub: string;
  /** Convenience alias for the user's UUID (e.g. "c92c31eb-e293-4276-a7c1-0f4dde155537"). */
  _id: string;
  email: string;
  role: UserRole;
}

/**
 * Refresh tokens carry an extra `rememberMe` claim so that the refresh flow can
 * preserve the user's original "Keep me signed in" choice across token rotations
 * without needing to persist that preference separately in the database.
 */
export interface RefreshJwtPayload extends AuthJwtPayload {
  rememberMe: boolean;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
  accessTokenExpiresInMs: number;
  refreshTokenExpiresInMs: number;
}

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly accessExpiresInSeconds: number;
  private readonly refreshSecret: string;
  private readonly rememberRefreshExpiresInSeconds: number;
  private readonly sessionRefreshExpiresInSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.accessSecret = this.requireEnv('JWT_ACCESS_TOKEN_SECRET');
    this.refreshSecret = this.requireEnv('JWT_REFRESH_TOKEN_SECRET');
    this.accessExpiresInSeconds = parseExpiryToSeconds(
      this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN') ?? '15m',
    );

    // "Keep me signed in" → long-lived refresh token. Falls back to the legacy
    // JWT_REFRESH_TOKEN_EXPIRES_IN env var so existing deployments keep working.
    this.rememberRefreshExpiresInSeconds = parseExpiryToSeconds(
      this.configService.get<string>('JWT_REFRESH_TOKEN_REMEMBER_EXPIRES_IN') ??
        this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRES_IN') ??
        '30d',
    );

    // Without "Keep me signed in" the refresh cookie is also a session cookie
    // (no maxAge), but we still cap the server-side JWT lifetime defensively
    // in case the browser ever retains the cookie across restarts.
    this.sessionRefreshExpiresInSeconds = parseExpiryToSeconds(
      this.configService.get<string>('JWT_REFRESH_TOKEN_SESSION_EXPIRES_IN') ??
        '1d',
    );
  }

  async issueTokens(
    payload: AuthJwtPayload,
    options?: { rememberMe?: boolean },
  ): Promise<IssuedTokens> {
    const rememberMe = options?.rememberMe ?? false;
    const refreshExpiresInSeconds = rememberMe
      ? this.rememberRefreshExpiresInSeconds
      : this.sessionRefreshExpiresInSeconds;

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresInSeconds,
    });

    const refreshPayload: RefreshJwtPayload = { ...payload, rememberMe };
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: refreshExpiresInSeconds,
      jwtid: randomUUID(),
    });

    return {
      accessToken,
      refreshToken,
      rememberMe,
      accessTokenExpiresInMs: this.accessExpiresInSeconds * 1000,
      refreshTokenExpiresInMs: refreshExpiresInSeconds * 1000,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthJwtPayload> {
    return this.jwtService.verifyAsync<AuthJwtPayload>(token, {
      secret: this.accessSecret,
    });
  }

  async verifyRefreshToken(token: string): Promise<RefreshJwtPayload> {
    return this.jwtService.verifyAsync<RefreshJwtPayload>(token, {
      secret: this.refreshSecret,
    });
  }

  private requireEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new InternalServerErrorException(`${key} is not configured`);
    }
    return value;
  }
}
