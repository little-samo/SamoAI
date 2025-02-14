import { Global, Module } from '@nestjs/common';

import { ShutdownService } from './shutdown.service';
import { RedisService } from './redis.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [ShutdownService, PrismaService, RedisService],
  exports: [ShutdownService, PrismaService, RedisService],
})
export class GlobalModule {}
