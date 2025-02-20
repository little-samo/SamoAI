import { ENV } from '@little-samo/samo-ai/common/config';
import { Controller, Get, HttpCode, HttpStatus, Logger } from '@nestjs/common';

@Controller()
export class SamoAiAppController {
  private readonly logger = new Logger(SamoAiAppController.name);

  @Get('health')
  @HttpCode(HttpStatus.OK)
  public async getHealth(): Promise<object> {
    if (ENV.DEBUG) {
      this.logger.log('Health check');
    }
    return { status: 'OK' };
  }
}
