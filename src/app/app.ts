import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import * as packageJson from '../../package.json';

import { AppModule } from './app.module';

export class SamoAiApp {
  public async bootstrap() {
    const app = await NestFactory.create(AppModule);

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
