import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response, CookieOptions } from 'express';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

type SameSiteOption = CookieOptions['sameSite'];

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('User account created successfully')
  async createNewUser(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.createNewUser(createUserDto);
    return user;
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Login successful')
  async loginUser(
    @Body() loginUserDto: LoginUserDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.userService.loginUser(loginUserDto);

    this.setAuthCookies(response, {
      accessToken: result.accessToken,
      accessTokenMaxAge: result.accessTokenExpiresInMs,
      refreshToken: result.refreshToken,
      refreshTokenMaxAge: result.refreshTokenExpiresInMs,
    });

    // The access token is delivered via an HttpOnly cookie (never persisted to
    // the DB and never readable by JS), so we deliberately omit it from the
    // JSON body to reduce the chance of it leaking to client-side storage.
    return {
      user: result.user,
    };
  }

  private setAuthCookies(
    response: Response,
    tokens: {
      accessToken: string;
      accessTokenMaxAge: number;
      refreshToken: string;
      refreshTokenMaxAge: number;
    },
  ): void {
    const secure =
      this.configService.get<string>('COOKIE_SECURE', 'false').toLowerCase() ===
      'true';
    const sameSite =
      (this.configService.get<string>(
        'COOKIE_SAME_SITE',
        'lax',
      ) as SameSiteOption) ?? 'lax';

    const baseOptions: CookieOptions = {
      httpOnly: true,
      secure,
      sameSite,
    };

    response.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      ...baseOptions,
      maxAge: tokens.accessTokenMaxAge,
      path: '/',
    });

    response.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...baseOptions,
      maxAge: tokens.refreshTokenMaxAge,
      // Scope the refresh token cookie to the auth endpoints so it's not sent
      // on every request, reducing exposure surface.
      path: '/users',
    });
  }
}
