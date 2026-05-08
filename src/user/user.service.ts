import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { PrismaService } from 'src/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private static readonly BCRYPT_SALT_ROUNDS = 10;

  constructor(private readonly prisma: PrismaService) {}

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
}
