import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CompanyDetailsDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  size?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}

/**
 * Partial update for a recruiter's profile. Providing `company` links the
 * recruiter to it by (case-insensitive) name: a new name creates the company
 * with the caller as owner; only the owner may change an existing company's
 * details, and a company owned by someone else can't be joined (409).
 */
export class UpdateRecruiterProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  designation?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyDetailsDto)
  company?: CompanyDetailsDto;
}
