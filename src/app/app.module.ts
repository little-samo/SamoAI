import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AgentsModule } from './agents/agents.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URL!),
    PrismaModule,
    RedisModule,
    AgentsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
