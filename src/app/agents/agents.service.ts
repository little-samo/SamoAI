import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AgentsService {
  protected readonly logger = new Logger(this.constructor.name);

  public constructor() {}

  protected async init() {
    this.logger.log('Initializing agent...');
  }

  protected async close() {
    this.logger.log('Closing agent...');
  }
}
