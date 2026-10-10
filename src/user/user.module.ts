import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TokenService } from './token.service';
import { EncryptionService } from '../common/services/encryption.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { VerificationTokenService } from './verification-token.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [UserController],
  providers: [
    UserService,
    TokenService,
    EncryptionService,
    AccessTokenGuard,
    VerificationTokenService,
  ],
  // Exported so feature modules (e.g. ProfileModule) can guard their routes
  // with the same cookie-based access token authentication.
  exports: [TokenService, AccessTokenGuard, VerificationTokenService],
})
export class UserModule {}
