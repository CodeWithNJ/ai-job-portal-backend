import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Claims embedded in a signed upload token. The token plays the same role as
 * an S3 pre-signed URL: possession of a valid, unexpired token is the sole
 * credential needed to perform the upload it describes.
 */
export interface UploadTokenPayload {
  /** User the upload belongs to. */
  sub: string;
  /** Storage key the file must be written to. */
  key: string;
  /** MIME type the upload must carry. */
  mime: string;
  /** Original client-side file name (metadata only). */
  fileName: string;
  /** Expiry as a unix epoch in seconds. */
  exp: number;
}

/**
 * Issues and verifies short-lived HMAC-SHA256-signed upload tokens, giving the
 * local-disk storage backend the same signed-URL upload flow the PRD requires,
 * so the frontend contract stays identical when storage moves to S3/R2 (whose
 * SDKs then produce the pre-signed URL instead).
 */
@Injectable()
export class UploadUrlService {
  private readonly signingSecret: string;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>('UPLOAD_URL_SIGNING_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'UPLOAD_URL_SIGNING_SECRET is not configured',
      );
    }
    this.signingSecret = secret;
  }

  sign(payload: UploadTokenPayload): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    return `${encodedPayload}.${this.hmac(encodedPayload)}`;
  }

  verify(token: string): UploadTokenPayload {
    const [encodedPayload, signature, ...rest] = token.split('.');
    if (!encodedPayload || !signature || rest.length > 0) {
      throw new UnauthorizedException('Invalid upload token');
    }

    const expectedSignature = this.hmac(encodedPayload);
    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid upload token');
    }

    let payload: UploadTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as UploadTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid upload token');
    }

    if (!payload.exp || payload.exp * 1000 < Date.now()) {
      throw new UnauthorizedException('Upload URL has expired');
    }

    return payload;
  }

  private hmac(input: string): string {
    return createHmac('sha256', this.signingSecret)
      .update(input)
      .digest('base64url');
  }
}
