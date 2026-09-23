import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum UserRole {
  JOB_SEEKER = 'job_seeker',
  RECRUITER = 'recruiter',
  ADMIN = 'admin',
}

// Admin accounts are provisioned out of band; self-signup must never grant them.
export const SIGNUP_ROLES = [UserRole.JOB_SEEKER, UserRole.RECRUITER] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9+\-()\s]+$/, {
    message: 'contactNo must be a valid phone number format',
  })
  contactNo?: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsNotEmpty()
  @IsIn(SIGNUP_ROLES, {
    message: `role must be one of the following values: ${SIGNUP_ROLES.join(', ')}`,
  })
  role!: SignupRole;
}
