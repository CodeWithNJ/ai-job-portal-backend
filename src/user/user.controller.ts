import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { AccessTokenGuard } from './guards/access-token.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthJwtPayload } from './token.service';

const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';
const ACCESS_TOKEN_COOKIE_PATH = '/';
const REFRESH_TOKEN_COOKIE_PATH = '/users';

type SameSiteOption = CookieOptions['sameSite'];

interface AuthCookiePayload {
  accessToken: string;
  accessTokenMaxAge: number;
  refreshToken: string;
  refreshTokenMaxAge: number;
  rememberMe: boolean;
}

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
      rememberMe: result.rememberMe,
    });

    // The access token is delivered via an HttpOnly cookie (never persisted to
    // the DB and never readable by JS), so we deliberately omit it from the
    // JSON body to reduce the chance of it leaking to client-side storage.
    return {
      user: result.user,
    };
  }

  /**
   * Trades a valid refresh cookie for a fresh access + refresh pair.
   *
   * The "Keep me signed in" preference originally chosen at login is encoded
   * inside the refresh JWT, so rotation preserves the user's cookie-lifetime
   * choice without any extra DB lookup.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Session refreshed')
  async refreshSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.readCookie(request, REFRESH_TOKEN_COOKIE);

    if (!refreshToken) {
      this.clearAuthCookies(response);
      throw new UnauthorizedException('No active session');
    }

    try {
      const result = await this.userService.refreshSession(refreshToken);

      this.setAuthCookies(response, {
        accessToken: result.accessToken,
        accessTokenMaxAge: result.accessTokenExpiresInMs,
        refreshToken: result.refreshToken,
        refreshTokenMaxAge: result.refreshTokenExpiresInMs,
        rememberMe: result.rememberMe,
      });

      return { user: result.user };
    } catch (error) {
      // Any refresh failure (expired, revoked, replay) should leave the
      // browser in a known-clean state so the next request hits the login UI.
      this.clearAuthCookies(response);
      throw error;
    }
  }

  /**
   * Returns the currently authenticated user's profile. Used by the SPA on
   * boot to silently rehydrate session state from the access cookie — this is
   * what makes "Keep me signed in" visible to the user.
   */
  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ResponseMessage('Profile fetched successfully')
  async getProfile(@CurrentUser() currentUser: AuthJwtPayload) {
    const user = await this.userService.getProfile(currentUser.sub);
    return { user };
  }

  /**
   * Clears the auth cookies and revokes the server-side refresh token so the
   * credential cannot be replayed even if it was previously captured.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Logged out successfully')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.readCookie(request, REFRESH_TOKEN_COOKIE);
    await this.userService.logout(refreshToken);
    this.clearAuthCookies(response);
    return null;
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookies = request.cookies as
      | Record<string, string | undefined>
      | undefined;
    return cookies?.[name];
  }

  private setAuthCookies(response: Response, tokens: AuthCookiePayload): void {
    const baseOptions = this.baseCookieOptions();

    // When rememberMe is false we deliberately omit `maxAge`/`expires` so the
    // browser treats both cookies as session cookies and discards them when
    // the user closes the browser. When true, the cookies persist for the
    // full JWT lifetime so the user stays signed in across restarts.
    response.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      ...baseOptions,
      ...(tokens.rememberMe ? { maxAge: tokens.accessTokenMaxAge } : {}),
      path: ACCESS_TOKEN_COOKIE_PATH,
    });

    response.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...baseOptions,
      ...(tokens.rememberMe ? { maxAge: tokens.refreshTokenMaxAge } : {}),
      // Scope the refresh token cookie to the auth endpoints so it's not sent
      // on every request, reducing exposure surface.
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
  }

  private clearAuthCookies(response: Response): void {
    const baseOptions = this.baseCookieOptions();

    response.clearCookie(ACCESS_TOKEN_COOKIE, {
      ...baseOptions,
      path: ACCESS_TOKEN_COOKIE_PATH,
    });
    response.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...baseOptions,
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
  }

  private baseCookieOptions(): CookieOptions {
    const secure =
      this.configService.get<string>('COOKIE_SECURE', 'false').toLowerCase() ===
      'true';
    const sameSite =
      (this.configService.get<string>(
        'COOKIE_SAME_SITE',
        'lax',
      ) as SameSiteOption) ?? 'lax';

    return {
      httpOnly: true,
      secure,
      sameSite,
    };
  }
}
