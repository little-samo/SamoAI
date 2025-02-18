import { DynamicModule, Module, Provider } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';

import { AgentsModule } from './agents/agents.module';
import { LocationsModule } from './locations/locations.module';
import { UsersModule } from './users/users.module';
import { TelegramModule } from './telegram/telegram.module';
import { GlobalModule } from './global/global.module';
import { SamoAiAppController } from './app.controller';

@Module({
  controllers: [SamoAiAppController],
})
export class AppModule {
  public static register(
    options: { providers?: Provider[] } = {}
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        GlobalModule,
        MongooseModule.forRoot(process.env.MONGODB_URL!),
        ScheduleModule.forRoot(),
        LocationsModule,
        AgentsModule,
        UsersModule,
        TelegramModule,
      ],
      controllers: [SamoAiAppController],
      providers: [...(options.providers || [])],
    };
  }
}
