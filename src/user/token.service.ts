import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { UserRole } from './dto/create-user.dto';

export interface AuthJwtPayload {
  /** Standard JWT subject claim — also the user's UUID. */
  sub: string;
  /** Convenience alias for the user's UUID (e.g. "c92c31eb-e293-4276-a7c1-0f4dde155537"). */
  _id: string;
  email: string;
  role: UserRole;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInMs: number;
  refreshTokenExpiresInMs: number;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  private readonly accessSecret: string;
  private readonly accessExpiresInSeconds: number;
  private readonly refreshSecret: string;
  private readonly refreshExpiresInSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.accessSecret = this.requireEnv('JWT_ACCESS_TOKEN_SECRET');
    this.refreshSecret = this.requireEnv('JWT_REFRESH_TOKEN_SECRET');
    this.accessExpiresInSeconds = this.parseExpiryToSeconds(
      this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN') ?? '15m',
    );
    this.refreshExpiresInSeconds = this.parseExpiryToSeconds(
      this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRES_IN') ?? '7d',
    );
  }

  async issueTokens(payload: AuthJwtPayload): Promise<IssuedTokens> {
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresInSeconds,
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresInSeconds,
      jwtid: randomUUID(),
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresInMs: this.accessExpiresInSeconds * 1000,
      refreshTokenExpiresInMs: this.refreshExpiresInSeconds * 1000,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthJwtPayload> {
    return this.jwtService.verifyAsync<AuthJwtPayload>(token, {
      secret: this.accessSecret,
    });
  }

  async verifyRefreshToken(token: string): Promise<AuthJwtPayload> {
    return this.jwtService.verifyAsync<AuthJwtPayload>(token, {
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

  /**
   * Parses values like `15m`, `7d`, `3600s`, or a bare number of seconds and
   * returns the equivalent number of seconds.
   */
  private parseExpiryToSeconds(expression: string): number {
    const trimmed = expression.trim();
    const match = /^(\d+)\s*([smhd])?$/i.exec(trimmed);

    if (!match) {
      this.logger.warn(
        `Unable to parse expiry expression "${expression}"; defaulting to 900s`,
      );
      return 900;
    }

    const value = Number(match[1]);
    const unit = (match[2] ?? 's').toLowerCase();

    const unitToSeconds: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    };

    return value * unitToSeconds[unit];
  }
}
