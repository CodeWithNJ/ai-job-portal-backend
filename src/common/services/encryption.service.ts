import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/**
 * AES-256-GCM symmetric encryption used for protecting secrets at rest
 * (e.g. refresh tokens stored in the database).
 *
 * Output format (base64 encoded):
 *   [12-byte IV][16-byte auth tag][N-byte ciphertext]
 *
 * GCM is an AEAD mode, so any tampering with the stored ciphertext is detected
 * at decrypt-time and surfaced as an error.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);

  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH_BYTES = 32;
  private static readonly IV_LENGTH_BYTES = 12;
  private static readonly AUTH_TAG_LENGTH_BYTES = 16;

  private key!: Buffer;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const rawKey = this.configService.get<string>(
      'REFRESH_TOKEN_ENCRYPTION_KEY',
    );

    if (!rawKey) {
      throw new InternalServerErrorException(
        'REFRESH_TOKEN_ENCRYPTION_KEY is not configured',
      );
    }

    const decoded = Buffer.from(rawKey, 'base64');

    if (decoded.length !== EncryptionService.KEY_LENGTH_BYTES) {
      throw new InternalServerErrorException(
        `REFRESH_TOKEN_ENCRYPTION_KEY must decode to ${EncryptionService.KEY_LENGTH_BYTES} bytes`,
      );
    }

    this.key = decoded;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(EncryptionService.IV_LENGTH_BYTES);
    const cipher = createCipheriv(EncryptionService.ALGORITHM, this.key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  decrypt(payload: string): string {
    try {
      const buffer = Buffer.from(payload, 'base64');

      const iv = buffer.subarray(0, EncryptionService.IV_LENGTH_BYTES);
      const authTag = buffer.subarray(
        EncryptionService.IV_LENGTH_BYTES,
        EncryptionService.IV_LENGTH_BYTES +
          EncryptionService.AUTH_TAG_LENGTH_BYTES,
      );
      const ciphertext = buffer.subarray(
        EncryptionService.IV_LENGTH_BYTES +
          EncryptionService.AUTH_TAG_LENGTH_BYTES,
      );

      const decipher = createDecipheriv(
        EncryptionService.ALGORITHM,
        this.key,
        iv,
      );
      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      this.logger.warn(
        `Failed to decrypt payload: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new InternalServerErrorException('Failed to decrypt payload');
    }
  }

  /**
   * Constant-time comparison of a plaintext value against a stored ciphertext,
   * useful for verifying that a presented refresh token matches the one
   * persisted in the database without leaking timing information.
   */
  matches(plaintext: string, encrypted: string): boolean {
    try {
      const decrypted = this.decrypt(encrypted);
      const a = Buffer.from(decrypted, 'utf8');
      const b = Buffer.from(plaintext, 'utf8');

      if (a.length !== b.length) {
        return false;
      }

      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
