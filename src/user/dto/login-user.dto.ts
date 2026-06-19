import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginUserDto {
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  password!: string;

  // Opt-in flag for "Keep me signed in". When true, the refresh cookie is
  // persisted (long maxAge) so the session survives browser restarts. When
  // false/omitted, the cookie is a session cookie that the browser discards
  // when the user closes it.
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
