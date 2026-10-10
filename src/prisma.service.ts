import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL as string,
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  // Release the pg pool on app.close() so shutdown (and e2e runs) don't hang
  // on open connections.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
