import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ENV } from '@common/config';
import { PrismaService } from '@app/prisma/prisma.service';
import { AgentsService } from '@app/agents/agents.service';
import { UsersService } from '@app/users/users.service';

import { TelegramBot } from './bots/telegram.bot';
import { TelegramRegistrarBot } from './bots/telegram.registrar-bot';
import { TelegramUpdateDto } from './dto/telegram.update-dto';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);

  private bots: Record<string, TelegramBot> = {};

  public constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService,
    private readonly usersService: UsersService
  ) {}

  private async registerBot(bot: TelegramBot): Promise<void> {
    try {
      const secret = await bot.registerWebhook();
      if (secret == null) {
        return;
      }
      await bot.setMyCommands();

      const agent = await this.agentsService.getAgentByTelegramBotToken(
        bot.token
      );
      if (agent) {
        const botUser = await bot.getMe();
        const botName = botUser.last_name
          ? `${botUser.first_name} ${botUser.last_name}`
          : botUser.first_name;
        if (
          agent.name !== botName ||
          agent.telegramUsername !== botUser.username
        ) {
          await this.prisma.agentModel.update({
            where: { id: agent.id },
            data: { name: botName, telegramUsername: botUser.username },
          });
        }
      }

      this.bots[secret] = bot;
      if (ENV.DEBUG) {
        this.logger.log(`Bot ${bot.name} registered with secret: ${secret}`);
      } else {
        this.logger.log(`Bot ${bot.name} registered`);
      }
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

  public async onModuleInit(): Promise<void> {
    const baseUrl = process.env.TELEGRAM_WEBHOOK_BASE_URL;
    if (!baseUrl) {
      this.logger.warn('TELEGRAM_WEBHOOK_BASE_URL is not set');
      return;
    }

    const registrarBotToken = process.env.TELEGRAM_REGISTRAR_BOT_TOKEN;
    if (registrarBotToken) {
      await this.registerBot(
        new TelegramRegistrarBot(
          this,
          this.prisma,
          this.usersService,
          this.agentsService,
          'Registrar',
          registrarBotToken
        )
      );
    } else {
      this.logger.warn('TELEGRAM_REGISTRAR_BOT_TOKEN is not set');
      return;
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await Promise.all(
      Object.values(this.bots).map((bot) => this.unregisterBot(bot))
    );
  }

  public async handleUpdate(
    secret: string,
    update: TelegramUpdateDto
  ): Promise<void> {
    const bot = this.bots[secret];
    this.logger.log(
      `Update received for bot ${bot?.name}: ${JSON.stringify(update)}`
    );
    if (bot) {
      await bot.handleUpdate(update);
    } else {
      throw new ServiceUnavailableException(
        'Bot not found for secret: ' + secret
      );
    }
  }
}
