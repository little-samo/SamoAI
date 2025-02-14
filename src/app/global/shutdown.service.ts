import { IncomingMessage, ServerResponse } from 'http';

import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Injectable()
export class ShutdownService implements OnModuleInit, OnApplicationShutdown {
  private logger = new Logger(ShutdownService.name);

  private activeRequests = 0;
  private isShuttingDown = false;
  private readonly resolveShutdowns: ((value: unknown) => void)[] = [];

  public constructor(private readonly adapterHost: HttpAdapterHost) {}

  public async onModuleInit() {
    const server = this.adapterHost.httpAdapter.getHttpServer();
    server.on(
      'request',
      (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => {
        if (this.isShuttingDown) {
          res.statusCode = 503;
          return res.end('Service Unavailable');
        }

        this.incrementActiveRequests();

        res.on('finish', () => {
          this.decrementActiveRequests();
          if (this.activeRequests === 0) {
            this.resolveShutdowns.forEach((resolve) => resolve(true));
          }
        });
      }
    );
  }

  public async onApplicationShutdown() {
    this.isShuttingDown = true;

    if (this.activeRequests > 0) {
      this.logger.log(
        `Waiting for ${this.activeRequests} requests to finish...`
      );
      await this.waitForShutdown();
    }
  }

  public incrementActiveRequests() {
    this.activeRequests++;
  }

  public decrementActiveRequests() {
    this.activeRequests--;
  }

  public waitForShutdown() {
    return new Promise((resolve) => this.resolveShutdowns.push(resolve));
  }
}
