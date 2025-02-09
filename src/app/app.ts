import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WorldManager } from '@core/managers/world.manager';

import * as packageJson from '../../package.json';

import { AppModule } from './app.module';
import { RedisService } from './redis/redis.service';
import { AgentsService } from './agents/agents.service';
import { LocationsService } from './locations/locations.service';
import { UsersService } from './users/users.service';

export class SamoAiApp {
  public async bootstrap() {
    const app = await NestFactory.create(AppModule);

    const redisService = app.get(RedisService);
    const agentsService = app.get(AgentsService);
    const locationsService = app.get(LocationsService);
    const usersService = app.get(UsersService);

    WorldManager.initialize(
      redisService,
      locationsService,
      agentsService,
      usersService
    );

    const config = new DocumentBuilder()
      .setTitle('Samo-AI API')
      .setDescription('Samo-AI API description')
      .setVersion(packageJson.version)
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);

    await app.listen(process.env.PORT ?? 11177);
  }
}
