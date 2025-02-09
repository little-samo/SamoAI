import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AgentsModule } from './agents/agents.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { LocationsModule } from './locations/locations.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URL!),
    PrismaModule,
    RedisModule,
    LocationsModule,
    AgentsModule,
    UsersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
