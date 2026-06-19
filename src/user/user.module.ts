import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaService } from 'src/prisma.service';
import { TokenService } from './token.service';
import { EncryptionService } from '../common/services/encryption.service';
import { AccessTokenGuard } from './guards/access-token.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [UserController],
  providers: [
    UserService,
    PrismaService,
    TokenService,
    EncryptionService,
    AccessTokenGuard,
  ],
})
export class UserModule {}
