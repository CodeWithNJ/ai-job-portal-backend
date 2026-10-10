import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Provides the single PrismaService (and so the single pg connection pool)
 * for the whole app. Global so feature modules inject PrismaService without
 * importing this module or re-providing it, which would open another pool.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
