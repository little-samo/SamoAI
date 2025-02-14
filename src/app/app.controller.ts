import { ENV } from '@common/config';
import { Controller, Get, HttpCode, HttpStatus, Logger } from '@nestjs/common';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  @Get('health')
  @HttpCode(HttpStatus.OK)
  public async getHealth(): Promise<object> {
    if (ENV.DEBUG) {
      this.logger.log('Health check');
    }
    return { status: 'OK' };
  }
}
