import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ENV } from '@common/config';
import { PrismaService } from '@app/global/prisma.service';
import { AgentsService } from '@app/agents/agents.service';
import { UsersService } from '@app/users/users.service';
import { LocationsService } from '@app/locations/locations.service';
import { ShutdownService } from '@app/global/shutdown.service';
import { Location } from '@models/locations/location';
import { UserPlatform } from '@prisma/client';

import { TelegramBot } from './bots/telegram.bot';
import { TelegramRegistrarBot } from './bots/telegram.registrar-bot';
import { TelegramUpdateDto } from './dto/telegram.update-dto';
import { TelegramChatBot } from './bots/telegram.chat-bot';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);

  public bots: Record<string, TelegramBot> = {};

  public constructor(
    private readonly shutdownService: ShutdownService,
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService,
    private readonly usersService: UsersService,
    private readonly locationsService: LocationsService
  ) {}

  public async registerBot(bot: TelegramBot): Promise<void> {
    try {
      if (!bot.token || this.bots[bot.token]) {
        return;
      }

      const success = await bot.registerWebhook();
      if (!success) {
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

      this.bots[bot.token] = bot;
      if (ENV.DEBUG) {
        this.logger.log(`Bot ${bot.name} registered with token: ${bot.token}`);
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
          this.shutdownService,
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
            this.shutdownService,
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

    await this.locationsService.registerLocationUpdatePreAction(
      UserPlatform.TELEGRAM,
      async (location) => {
        await this.telegramLocationUpdatePreAction(location);
      }
    );
  }

  public async onModuleDestroy(): Promise<void> {
    await Promise.all(
      Object.values(this.bots).map((bot) => this.unregisterBot(bot))
    );
  }

  private async telegramLocationUpdatePreAction(
    location: Location
  ): Promise<void> {
    switch (location.model.platform) {
      case UserPlatform.TELEGRAM:
        TelegramChatBot.updateLocationMeta(location);

        location.addAgentExecuteNextActionsPreHook(async (location, agent) => {
          if (ENV.DEBUG) {
            this.logger.log(
              `[${location.model.name}] Agent ${agent.model.name} is executing next actions`
            );
          }
          const bot = this.bots[agent.model.telegramBotToken!];
          if (bot) {
            await bot.sendChatAction(Number(location.model.telegramChatId!));
            setTimeout(() => {
              void bot.sendChatAction(
                Number(location.model.telegramChatId!),
                'typing'
              );
            }, 5000);
          }
        });

        location.addAgentMessageHook(
          async (location, agent, agentMessage, expression) => {
            if (ENV.DEBUG) {
              this.logger.log(
                `[${location.model.name}] Agent response: ${agentMessage} (${expression})`
              );
            }
            if (agentMessage) {
              const bot = this.bots[agent.model.telegramBotToken!];
              if (bot) {
                await bot.sendChatTextMessage(
                  Number(location.model.telegramChatId!),
                  TelegramChatBot.changeMarkdownToHtml(agentMessage)
                );
              }
            }
          }
        );
        break;
    }
  }

  public async handleUpdate(
    token: string,
    update: TelegramUpdateDto
  ): Promise<void> {
    const bot = this.bots[token];
    this.logger.log(
      `Update received for bot ${bot?.name ?? token}: ${JSON.stringify(update)}`
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
