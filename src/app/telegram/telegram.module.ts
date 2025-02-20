import { Module } from '@nestjs/common';
import { AgentsModule } from '@little-samo/samo-ai/app/agents/agents.module';
import { UsersModule } from '@little-samo/samo-ai/app/users/users.module';
import { LocationsModule } from '@little-samo/samo-ai/app/locations/locations.module';

import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [AgentsModule, UsersModule, LocationsModule],
  providers: [TelegramService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}
