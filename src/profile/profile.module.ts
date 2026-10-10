import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { UserModule } from '../user/user.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ResumeUploadController } from './resume-upload.controller';

@Module({
  imports: [UserModule, StorageModule],
  controllers: [ProfileController, ResumeUploadController],
  providers: [ProfileService],
})
export class ProfileModule {}
