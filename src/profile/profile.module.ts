import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { StorageModule } from '../storage/storage.module';
import { UserModule } from '../user/user.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ResumeUploadController } from './resume-upload.controller';

@Module({
  imports: [UserModule, StorageModule],
  controllers: [ProfileController, ResumeUploadController],
  providers: [ProfileService, PrismaService],
})
export class ProfileModule {}
