import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ExperienceEntryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  title!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  company!: string;

  /** ISO date or free-form ("2021-04", "Apr 2021"). Kept as text for MVP. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  startDate?: string;

  /** Empty/omitted means "present". */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class EducationEntryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  degree!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  institution!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  year?: string;
}

export class WorkPreferencesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  jobTypes?: string[];

  @IsOptional()
  @IsIn(['remote', 'hybrid', 'onsite', 'any'])
  remotePreference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  expectedCompensation?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  noticePeriodDays?: number;
}

/**
 * Partial update for a job seeker's profile — every field optional; only the
 * provided fields are written. Parsed-resume fields are deliberately absent:
 * they are owned by the parsing pipeline and must not be client-writable.
 */
export class UpdateJobSeekerProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  skills?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  experienceYears?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ExperienceEntryDto)
  experience?: ExperienceEntryDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EducationEntryDto)
  education?: EducationEntryDto[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkPreferencesDto)
  workPreferences?: WorkPreferencesDto;
}
