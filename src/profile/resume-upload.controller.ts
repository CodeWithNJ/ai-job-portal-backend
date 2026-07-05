import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { UploadUrlService } from '../storage/upload-url.service';
import { ProfileService } from './profile.service';

/**
 * Receives the actual file bytes for a previously issued signed upload URL.
 *
 * Deliberately unauthenticated (no cookie guard): exactly like an S3
 * pre-signed URL, the HMAC-signed, expiring token in the path is the
 * credential, and it is bound to one user, one storage key, and one MIME
 * type. The raw request body is provided by the express.raw() middleware
 * registered for this route in main.ts.
 */
@Controller('uploads')
export class ResumeUploadController {
  constructor(
    private readonly uploadUrlService: UploadUrlService,
    private readonly profileService: ProfileService,
  ) {}

  @Put('resumes/:token')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Resume uploaded successfully')
  async uploadResume(
    @Param('token') token: string,
    @Req() request: Request,
    @Headers('content-type') contentType: string | undefined,
  ) {
    const payload = this.uploadUrlService.verify(token);
    const profile = await this.profileService.completeResumeUpload(
      payload,
      request.body as Buffer | undefined,
      contentType,
    );

    return {
      storageKey: profile.resumeUrl,
      fileName: profile.resumeFileName,
      uploadedAt: profile.resumeUploadedAt,
    };
  }
}
