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
  public isShuttingDown = false;
  private readonly resolveShutdowns: (() => void)[] = [];

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
            this.resolveShutdowns.forEach((resolve) => resolve());
          }
        });
      }
    );
  }

  public async onApplicationShutdown() {
    this.isShuttingDown = true;

    this.logger.log('Shutting down...');
    if (this.activeRequests > 0) {
      this.logger.log(
        `Waiting for ${this.activeRequests} requests to finish...`
      );
      await this.waitForShutdown();
    }

    this.logger.log('Shutdown complete');
  }

  public incrementActiveRequests(): void {
    this.activeRequests++;
  }

  public decrementActiveRequests(): void {
    this.activeRequests--;
  }

  public waitForShutdown(): Promise<void> {
    if (this.activeRequests > 0) {
      return new Promise((resolve) => this.resolveShutdowns.push(resolve));
    }

    return Promise.resolve();
  }
}
