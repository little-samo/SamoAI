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
import { LocationsService } from '@app/locations/locations.service';

import { TelegramBot } from './bots/telegram.bot';
import { TelegramRegistrarBot } from './bots/telegram.registrar-bot';
import { TelegramUpdateDto } from './dto/telegram.update-dto';
import { TelegramChatBot } from './bots/telegram.chat-bot';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);

  private bots: Record<string, TelegramBot> = {};

  public constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService,
    private readonly usersService: UsersService,
    private readonly locationsService: LocationsService
  ) {}

  public async registerBot(bot: TelegramBot): Promise<void> {
    try {
      const token = await bot.registerWebhook();
      if (token == null) {
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

      this.bots[token] = bot;
      if (ENV.DEBUG) {
        this.logger.log(`Bot ${bot.name} registered with token: ${token}`);
      } else {
        this.logger.log(`Bot ${bot.name} registered`);
      }
    } catch (error) {
      this.logger.error(`Error registering bot: ${error}`);
    }
  }

  public async unregisterBot(bot: TelegramBot): Promise<void> {
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
    }

    const registrarBotToken = process.env.TELEGRAM_REGISTRAR_BOT_TOKEN;
    if (registrarBotToken) {
      await this.registerBot(
        new TelegramRegistrarBot(
          this,
          this.prisma,
          this.usersService,
          this.agentsService,
          this.locationsService,
          'Registrar',
          registrarBotToken
        )
      );
    } else {
      this.logger.warn('TELEGRAM_REGISTRAR_BOT_TOKEN is not set');
    }

    if (!process.env.TELEGRAM_LLM_API_USER_ID) {
      this.logger.warn('TELEGRAM_LLM_API_USER_ID is not set');
      return;
    } else {
      for (const agentModel of await this.agentsService.getAllTelegramAgentModels()) {
        await this.registerBot(
          new TelegramChatBot(
            this,
            this.prisma,
            this.usersService,
            this.agentsService,
            this.locationsService,
            agentModel.name,
            agentModel.telegramBotToken!
          )
        );
      }
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await Promise.all(
      Object.values(this.bots).map((bot) => this.unregisterBot(bot))
    );
  }

  public async handleUpdate(
    token: string,
    update: TelegramUpdateDto
  ): Promise<void> {
    const bot = this.bots[token];
    this.logger.log(
      `Update received for bot ${bot?.name}: ${JSON.stringify(update)}`
    );
    if (bot) {
      await bot.handleUpdate(update);
    } else {
      throw new ServiceUnavailableException(
        `Bot not found for token: ${token}`
      );
    }
  }
}
