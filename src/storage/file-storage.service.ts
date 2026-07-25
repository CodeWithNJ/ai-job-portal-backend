import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve, sep } from 'path';

/**
 * Local-disk file storage keyed by S3-style object keys (e.g.
 * `resumes/<userId>/<uploadId>.pdf`). Only the storage key is persisted in the
 * database, so swapping this implementation for an S3-compatible backend
 * (AWS S3, Cloudflare R2, MinIO) later only requires replacing this service —
 * no data migration.
 */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly baseDir: string;

  // Keys are generated server-side, but validate anyway so a tampered signed
  // token can never escape the storage root.
  private static readonly SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/;

  constructor(private readonly configService: ConfigService) {
    this.baseDir = resolve(
      this.configService.get<string>('RESUME_STORAGE_DIR') ?? './storage',
    );
  }

  async save(key: string, contents: Buffer): Promise<void> {
    const absolutePath = this.toAbsolutePath(key);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
    this.logger.log(`Stored file at key ${key} (${contents.length} bytes)`);
  }

  async read(key: string): Promise<Buffer> {
    const absolutePath = this.toAbsolutePath(key);
    try {
      return await readFile(absolutePath);
    } catch {
      throw new NotFoundException(`Stored file not found for key ${key}`);
    }
  }

  private toAbsolutePath(key: string): string {
    if (!FileStorageService.SAFE_KEY_PATTERN.test(key) || key.includes('..')) {
      throw new BadRequestException('Invalid storage key');
    }

    const absolutePath = resolve(this.baseDir, key);
    if (!absolutePath.startsWith(this.baseDir + sep)) {
      throw new InternalServerErrorException(
        'Resolved path escapes storage root',
      );
    }

    return absolutePath;
  }
}
