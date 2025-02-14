import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { ShutdownService } from './shutdown.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  public constructor(private shutdownService: ShutdownService) {
    super();
  }

  public async onModuleInit() {
    await this.$connect();
  }

  public async onApplicationShutdown() {
    await this.shutdownService.waitForShutdown();
    await this.$disconnect();
  }
}
