import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto, UserRole } from './dto/create-user.dto';
import { PrismaService } from 'src/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login-user.dto';
import { TokenService } from './token.service';
import { EncryptionService } from '../common/services/encryption.service';

export interface LoginResult {
  user: {
    id: string;
    email: string;
    role: UserRole;
    lastLoginAt: Date | null;
  };
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInMs: number;
  refreshTokenExpiresInMs: number;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private static readonly BCRYPT_SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async createNewUser(createUserDto: CreateUserDto) {
    const { email, contactNo, role, password } = createUserDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException(
        `Account already exists with this email: ${email}`,
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      UserService.BCRYPT_SALT_ROUNDS,
    );

    const user = await this.prisma.user.create({
      data: {
        email,
        contactNo,
        passwordHash: hashedPassword,
        role,
      },
      select: {
        id: true,
        email: true,
        contactNo: true,
        role: true,
        isAccountActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.logger.log(`New user created: ${user.id}`);
    return user;
  }

  async loginUser(loginUserDto: LoginUserDto): Promise<LoginResult> {
    const { email, password } = loginUserDto;

    const userFound = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        passwordHash: true,
        isAccountActive: true,
      },
    });

    // Use a uniform error for "missing user" and "wrong password" so the API
    // does not become an account-enumeration oracle.
    if (!userFound) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!userFound.isAccountActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    const passwordMatches = await bcrypt.compare(
      password,
      userFound.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.tokenService.issueTokens({
      sub: userFound.id,
      _id: userFound.id,
      email: userFound.email,
      role: userFound.role as UserRole,
    });

    const encryptedRefreshToken = this.encryptionService.encrypt(
      tokens.refreshToken,
    );

    const updatedUser = await this.prisma.user.update({
      where: { id: userFound.id },
      data: {
        refreshToken: encryptedRefreshToken,
        lastLoginAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        role: true,
        lastLoginAt: true,
      },
    });

    this.logger.log(`User logged in: ${updatedUser.id}`);

    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role as UserRole,
        lastLoginAt: updatedUser.lastLoginAt,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresInMs: tokens.accessTokenExpiresInMs,
      refreshTokenExpiresInMs: tokens.refreshTokenExpiresInMs,
    };
  }
}
