import { Module } from '@nestjs/common';
import { AgentsModule } from '@app/agents/agents.module';
import { UsersModule } from '@app/users/users.module';
import { LocationsModule } from '@app/locations/locations.module';

import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [AgentsModule, UsersModule, LocationsModule],
  providers: [TelegramService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}
