import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WorldManager } from '@core/managers/world.manager';
import { INestApplication, Logger } from '@nestjs/common';

import * as packageJson from '../../package.json';

import { AppModule } from './app.module';
import { RedisService } from './redis/redis.service';
import { AgentsService } from './agents/agents.service';
import { LocationsService } from './locations/locations.service';
import { UsersService } from './users/users.service';

export class SamoAiApp {
  private readonly logger = new Logger(SamoAiApp.name);

  public app?: INestApplication;

  public async bootstrap(listen: boolean = true) {
    this.app = await NestFactory.create(AppModule);

    const redisService = this.app.get(RedisService);
    const agentsService = this.app.get(AgentsService);
    const locationsService = this.app.get(LocationsService);
    const usersService = this.app.get(UsersService);

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
    const documentFactory = () =>
      SwaggerModule.createDocument(this.app!, config);
    SwaggerModule.setup('api', this.app, documentFactory);

    if (listen) {
      const host = process.env.SAMO_AI_HOST ?? '0.0.0.0';
      const port = process.env.SAMO_AI_PORT ?? 11177;
      await this.app.listen(port, host);
      this.logger.log(`Samo-AI API listening on ${host}:${port}`);
    }
  }
}
