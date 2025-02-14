import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AgentsModule } from './agents/agents.module';
import { LocationsModule } from './locations/locations.module';
import { UsersModule } from './users/users.module';
import { TelegramModule } from './telegram/telegram.module';
import { GlobalModule } from './global/global.module';

@Module({
  imports: [
    GlobalModule,
    MongooseModule.forRoot(process.env.MONGODB_URL!),
    LocationsModule,
    AgentsModule,
    UsersModule,
    TelegramModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
