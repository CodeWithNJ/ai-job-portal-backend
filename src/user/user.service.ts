import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { PrismaService } from 'src/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async createNewUser(createUserDto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    return this.prisma.user.create({
      data: {
        email: createUserDto.email,
        contactNo: createUserDto.contactNo,
        passwordHash: hashedPassword,
        role: createUserDto.role,
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
  }
}
