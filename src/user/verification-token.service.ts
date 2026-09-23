import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { parseExpiryToSeconds } from 'src/common/utils/parse-expiry';
import { PrismaService } from 'src/prisma.service';

enum VerificationTokenType {
  EMAIL_VERIFICATION_TOKEN = 'email_verification',
  PASSWORD_RESET = 'password_reset',
}

@Injectable()
export class VerificationTokenService {
  private readonly verificationTokenExpiresInSeconds: number;
  private readonly resetTokenExpiresInSeconds: number;
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    this.verificationTokenExpiresInSeconds = parseExpiryToSeconds(
      this.configService.get<string>('EMAIL_VERIFICATION_TOKEN_TTL') ?? '24h',
    );
    this.resetTokenExpiresInSeconds = parseExpiryToSeconds(
      this.configService.get<string>('PASSWORD_RESET_TOKEN_TTL') ?? '30m',
    );
  }

  /**
   * Issues a single-use token of the given type and returns the raw value.
   *
   * The plaintext exists only in this return value — the row stores its
   * SHA-256 hex digest, so a database leak yields nothing usable. Callers are
   * responsible for putting it in a link and must never log or persist it.
   */
  async issueTokens(
    userId: string,
    type: VerificationTokenType,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const ttlInSeconds =
      type === VerificationTokenType.EMAIL_VERIFICATION_TOKEN
        ? this.verificationTokenExpiresInSeconds
        : this.resetTokenExpiresInSeconds;

    // parseExpiryToSeconds returns seconds; Date.now() is milliseconds.
    const expiresAt = new Date(Date.now() + ttlInSeconds * 1000);

    // One transaction so the user is never left holding two live tokens of the
    // same type, or none at all if the second statement fails.
    await this.prismaService.$transaction([
      // A fresh token supersedes whatever was outstanding, so an older link
      // stops working the moment a replacement is sent.
      this.prismaService.verificationToken.updateMany({
        where: { userId, type, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prismaService.verificationToken.create({
        data: { userId, type, tokenHash, expiresAt },
      }),
    ]);

    return token;
  }

  async consume(rawToken: string, type: string): Promise<string> {
    return '';
  }

  async peek(rawToken: string, type: string): Promise<void> {}
}
