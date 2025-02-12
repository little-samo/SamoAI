import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';

import { TelegramBot } from './bots/telegram.bot';
import { TelegramRegistrarBot } from './bots/telegram.registrar-bot';
import { TelegramUpdateDto } from './dto/telegram.update-dto';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);

  private bots: Record<string, TelegramBot> = {};

  private async registerBot(bot: TelegramBot): Promise<void> {
    try {
      const secret = await bot.registerWebhook();
      if (secret == null) {
        return;
      }
      this.bots[bot.token] = bot;
    } catch (error) {
      this.logger.error(`Error registering bot: ${error}`);
    }
  }

  private async unregisterBot(bot: TelegramBot): Promise<void> {
    try {
      await bot.deleteWebhook();
    } catch (error) {
      this.logger.error(`Error unregistering bot: ${error}`);
    }
  }

  public async onModuleInit() {
    const registrarBotToken = process.env.TELEGRAM_REGISTRAR_BOT_TOKEN;
    if (registrarBotToken) {
      await this.registerBot(
        new TelegramRegistrarBot('Registrar', registrarBotToken)
      );
    }
  }

  public async onModuleDestroy() {
    await Promise.all(
      Object.values(this.bots).map((bot) => this.unregisterBot(bot))
    );
  }

  public async handleUpdate(
    secret: string,
    update: TelegramUpdateDto
  ): Promise<void> {
    const bot = this.bots[secret];
    this.logger.log(`Update received for bot: ${JSON.stringify(update)}`);
    if (bot) {
      await bot.handleUpdate(update);
    } else {
      this.logger.warn(`No bot found for secret: ${secret}`);
    }
  }
}
