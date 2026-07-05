import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const ALLOWED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export type ResumeMimeType = (typeof ALLOWED_RESUME_MIME_TYPES)[number];

export class CreateResumeUploadUrlDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsNotEmpty()
  @IsIn(ALLOWED_RESUME_MIME_TYPES, {
    message: 'Only PDF and DOCX resumes are supported',
  })
  mimeType!: ResumeMimeType;
}
