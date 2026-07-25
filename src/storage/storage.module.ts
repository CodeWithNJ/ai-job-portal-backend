import { Module } from '@nestjs/common';
import { FileStorageService } from './file-storage.service';
import { UploadUrlService } from './upload-url.service';

@Module({
  providers: [FileStorageService, UploadUrlService],
  exports: [FileStorageService, UploadUrlService],
})
export class StorageModule {}
