import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { instanceToPlain } from 'class-transformer';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma.service';
import { validateBody } from '../common/utils/validate-body';
import { FileStorageService } from '../storage/file-storage.service';
import {
  UploadTokenPayload,
  UploadUrlService,
} from '../storage/upload-url.service';
import { UserRole } from '../user/dto/create-user.dto';
import type { AuthJwtPayload } from '../user/token.service';
import {
  ALLOWED_RESUME_MIME_TYPES,
  CreateResumeUploadUrlDto,
  ResumeMimeType,
} from './dto/create-resume-upload-url.dto';
import { UpdateJobSeekerProfileDto } from './dto/update-job-seeker-profile.dto';
import { UpdateRecruiterProfileDto } from './dto/update-recruiter-profile.dto';

const MIME_TO_EXTENSION: Record<ResumeMimeType, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
};

export interface ResumeUploadUrlResult {
  uploadUrl: string;
  method: 'PUT';
  headers: { 'Content-Type': string };
  expiresAt: string;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly fileStorage: FileStorageService,
    private readonly uploadUrlService: UploadUrlService,
  ) {}

  /**
   * Returns the caller's role-specific profile, creating an empty row on
   * first access so the frontend always receives an editable object.
   */
  async getMyProfile(currentUser: AuthJwtPayload) {
    if (currentUser.role === UserRole.JOB_SEEKER) {
      const profile = await this.prisma.jobSeekerProfile.upsert({
        where: { userId: currentUser.sub },
        create: { userId: currentUser.sub },
        update: {},
      });
      return { role: currentUser.role, profile };
    }

    if (currentUser.role === UserRole.RECRUITER) {
      const profile = await this.prisma.recruiterProfile.upsert({
        where: { userId: currentUser.sub },
        create: { userId: currentUser.sub },
        update: {},
        include: { company: true },
      });
      return { role: currentUser.role, profile };
    }

    throw new BadRequestException(
      `No profile exists for role ${currentUser.role}`,
    );
  }

  /**
   * Applies a partial update to the caller's profile. The body is validated
   * against the DTO matching the caller's role, so a single PATCH /profiles/me
   * endpoint serves both marketplace sides.
   */
  async updateMyProfile(currentUser: AuthJwtPayload, body: unknown) {
    if (currentUser.role === UserRole.JOB_SEEKER) {
      const dto = await validateBody(UpdateJobSeekerProfileDto, body);
      return this.updateJobSeekerProfile(currentUser.sub, dto);
    }

    if (currentUser.role === UserRole.RECRUITER) {
      const dto = await validateBody(UpdateRecruiterProfileDto, body);
      return this.updateRecruiterProfile(currentUser.sub, dto);
    }

    throw new BadRequestException(
      `No profile exists for role ${currentUser.role}`,
    );
  }

  /**
   * Issues a short-lived signed URL the client PUTs the resume file to,
   * mirroring the S3 pre-signed upload flow (the API never proxies file
   * bytes through an authenticated JSON endpoint).
   */
  createResumeUploadUrl(
    userId: string,
    dto: CreateResumeUploadUrlDto,
  ): ResumeUploadUrlResult {
    const extension = MIME_TO_EXTENSION[dto.mimeType];
    const storageKey = `resumes/${userId}/${randomUUID()}.${extension}`;
    const expiresAtEpochSeconds =
      Math.floor(Date.now() / 1000) + this.uploadUrlTtlSeconds();

    const token = this.uploadUrlService.sign({
      sub: userId,
      key: storageKey,
      mime: dto.mimeType,
      fileName: dto.fileName,
      exp: expiresAtEpochSeconds,
    });

    return {
      uploadUrl: `${this.appBaseUrl()}/uploads/resumes/${token}`,
      method: 'PUT',
      headers: { 'Content-Type': dto.mimeType },
      expiresAt: new Date(expiresAtEpochSeconds * 1000).toISOString(),
    };
  }

  /**
   * Verifies and persists an uploaded resume file, then records its metadata
   * on the owner's profile. Called by the signed-URL upload endpoint after
   * the token signature has been verified.
   */
  async completeResumeUpload(
    tokenPayload: UploadTokenPayload,
    contents: Buffer | undefined,
    contentType: string | undefined,
  ) {
    if (!contents || !Buffer.isBuffer(contents) || contents.length === 0) {
      throw new BadRequestException('Upload body is empty');
    }

    const maxBytes = this.maxResumeSizeMb() * 1024 * 1024;
    if (contents.length > maxBytes) {
      throw new PayloadTooLargeException(
        `Resume exceeds the ${this.maxResumeSizeMb()}MB limit`,
      );
    }

    const declaredMime = contentType?.split(';')[0].trim().toLowerCase();
    if (declaredMime !== tokenPayload.mime) {
      throw new UnsupportedMediaTypeException(
        'Content-Type does not match the type this upload URL was issued for',
      );
    }

    this.assertMagicBytes(contents, tokenPayload.mime);

    await this.fileStorage.save(tokenPayload.key, contents);

    const resetParseState = {
      resumeParseStatus: 'not_started' as const,
      parsedResume: Prisma.DbNull,
      resumeParsedAt: null,
      resumeParseError: null,
    };

    const profile = await this.prisma.jobSeekerProfile.upsert({
      where: { userId: tokenPayload.sub },
      create: {
        userId: tokenPayload.sub,
        resumeUrl: tokenPayload.key,
        resumeFileName: tokenPayload.fileName,
        resumeMimeType: tokenPayload.mime,
        resumeUploadedAt: new Date(),
      },
      update: {
        resumeUrl: tokenPayload.key,
        resumeFileName: tokenPayload.fileName,
        resumeMimeType: tokenPayload.mime,
        resumeUploadedAt: new Date(),
        ...resetParseState,
      },
    });

    this.logger.log(
      `Resume uploaded for user ${tokenPayload.sub}: ${tokenPayload.key}`,
    );

    return profile;
  }

  private async updateJobSeekerProfile(
    userId: string,
    dto: UpdateJobSeekerProfileDto,
  ) {
    const data: Prisma.JobSeekerProfileUpdateInput = {};

    if (dto.headline !== undefined) data.headline = dto.headline;
    if (dto.summary !== undefined) data.summary = dto.summary;
    if (dto.skills !== undefined) data.skills = dto.skills;
    if (dto.experienceYears !== undefined) {
      data.experienceYears = dto.experienceYears;
    }
    if (dto.experience !== undefined) {
      data.experience = instanceToPlain(
        dto.experience,
      ) as Prisma.InputJsonValue;
    }
    if (dto.education !== undefined) {
      data.education = instanceToPlain(dto.education) as Prisma.InputJsonValue;
    }
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.workPreferences !== undefined) {
      data.workPreferences = instanceToPlain(
        dto.workPreferences,
      ) as Prisma.InputJsonValue;
    }

    const profile = await this.prisma.jobSeekerProfile.upsert({
      where: { userId },
      create: {
        ...(data as Omit<
          Prisma.JobSeekerProfileUncheckedCreateInput,
          'userId'
        >),
        userId,
      },
      update: data,
    });

    return { role: UserRole.JOB_SEEKER, profile };
  }

  private async updateRecruiterProfile(
    userId: string,
    dto: UpdateRecruiterProfileDto,
  ) {
    let companyId: string | undefined;

    if (dto.company) {
      const { name, ...details } = dto.company;
      const definedDetails = Object.fromEntries(
        Object.entries(details).filter(([, value]) => value !== undefined),
      );

      const company = await this.prisma.company.upsert({
        where: { name },
        create: { name, ...definedDetails },
        update: definedDetails,
      });
      companyId = company.id;
    }

    const data: Prisma.RecruiterProfileUncheckedUpdateInput = {};
    if (dto.designation !== undefined) data.designation = dto.designation;
    if (companyId !== undefined) data.companyId = companyId;

    const profile = await this.prisma.recruiterProfile.upsert({
      where: { userId },
      create: {
        userId,
        designation: dto.designation,
        companyId,
      },
      update: data,
      include: { company: true },
    });

    return { role: UserRole.RECRUITER, profile };
  }

  /**
   * Cheap file-signature check so a mislabelled or malicious file can't be
   * stored under a resume MIME type: PDFs start with "%PDF", DOCX files are
   * ZIP containers starting with "PK\x03\x04".
   */
  private assertMagicBytes(contents: Buffer, mime: string): void {
    const isPdf = contents.subarray(0, 4).toString('latin1') === '%PDF';
    const isZip =
      contents[0] === 0x50 &&
      contents[1] === 0x4b &&
      contents[2] === 0x03 &&
      contents[3] === 0x04;

    const valid =
      (mime === ALLOWED_RESUME_MIME_TYPES[0] && isPdf) ||
      (mime === ALLOWED_RESUME_MIME_TYPES[1] && isZip);

    if (!valid) {
      throw new UnsupportedMediaTypeException(
        'File contents do not match the declared type',
      );
    }
  }

  private uploadUrlTtlSeconds(): number {
    const raw = this.configService.get<string>('UPLOAD_URL_TTL') ?? '10m';
    const match = /^(\d+)\s*([smh])?$/i.exec(raw.trim());
    if (!match) return 600;
    const value = Number(match[1]);
    const unit = (match[2] ?? 's').toLowerCase();
    return value * (unit === 'h' ? 3600 : unit === 'm' ? 60 : 1);
  }

  private maxResumeSizeMb(): number {
    const raw = Number(this.configService.get<string>('MAX_RESUME_SIZE_MB'));
    return Number.isFinite(raw) && raw > 0 ? raw : 10;
  }

  private appBaseUrl(): string {
    const configured = this.configService.get<string>('APP_BASE_URL');
    if (configured) return configured.replace(/\/+$/, '');
    const port = this.configService.get<string>('PORT') ?? '7500';
    return `http://localhost:${port}`;
  }
}
