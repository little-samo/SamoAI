import {
  LocationModel,
  LocationType,
  UserModel,
  UserPlatform,
} from '@prisma/client';
import { ENV } from '@common/config';
import { WorldManager } from '@core/managers/world.manager';
import { Agent } from '@models/entities/agents/agent';
import { Location } from '@models/locations/location';

import { TelegramMessageDto } from '../dto/telegram.message-dto';
import { TelegramUserDto } from '../dto/telegram.user-dto';
import {
  TELEGRAM_BOT_GROUP_LOCATION_META,
  TELEGRAM_BOT_PRIVATE_LOCATION_META,
  TELEGRAM_MESSAGE_LENGTH_LIMIT,
} from '../meta/location.meta';

import { TelegramAgentBot } from './telegram.agent-bot';

export const TELEGRAM_BOT_PRIVATE_LOCATION_PREFIX = 'TELEGRAM_BOT_PRIVATE';

export class TelegramChatBot extends TelegramAgentBot {
  public static updateLocationMeta(location: Location): void {
    switch (location.model.type) {
      case LocationType.PRIVATE:
        location.meta = {
          ...TELEGRAM_BOT_PRIVATE_LOCATION_META,
          ...(location.model.meta as object),
        };
        break;
      case LocationType.GROUP:
        location.meta = {
          ...TELEGRAM_BOT_GROUP_LOCATION_META,
          ...(location.model.meta as object),
        };
        break;
    }
  }

  public static changeMarkdownToHtml(text: string): string {
    return text.replace(/\*(.*?)\*/g, '<i>$1</i>');
  }

  public async locationUpdatePreAction(location: Location): Promise<void> {
    TelegramChatBot.updateLocationMeta(location);
    location.addAgentMessageHook((loc, agent, message, expression) =>
      this.handleAgentMessage(loc, agent, message, expression)
    );
  }

  public async handleAgentMessage(
    location: Location,
    agent: Agent,
    agentMessage?: string,
    expression?: string
  ): Promise<void> {
    if (ENV.DEBUG) {
      this.logger.log(
        `[${location.model.name}] Agent response: ${agentMessage} (${expression})`
      );
    }
    if (agentMessage) {
      await this.sendChatTextMessage(
        Number(location.model.telegramChatId),
        TelegramChatBot.changeMarkdownToHtml(agentMessage)
      );
    }
  }

  private async handleSave(save: Promise<void>): Promise<void> {
    this.shutdownService.incrementActiveRequests();
    try {
      await save;
    } finally {
      this.shutdownService.decrementActiveRequests();
    }
  }

  protected async handleTextMessage(
    user: UserModel,
    message: TelegramMessageDto,
    from: TelegramUserDto,
    text: string
  ): Promise<void> {
    if (message.chat.type === 'private') {
      await this.handlePrivateMessage(user, message, from, text);
    }
  }

  private async handlePrivateMessage(
    user: UserModel,
    message: TelegramMessageDto,
    from: TelegramUserDto,
    text: string
  ): Promise<void> {
    if (text.length > TELEGRAM_MESSAGE_LENGTH_LIMIT) {
      text =
        text.slice(0, TELEGRAM_MESSAGE_LENGTH_LIMIT - 14) + '...[TRUNCATED]';
    }

    const locationName = `${TELEGRAM_BOT_PRIVATE_LOCATION_PREFIX}/agent:${this.agent!.id}/user:${user.id}`;
    const locationModel =
      await this.locationsService.getOrCreateLocationModelByName({
        platform: UserPlatform.TELEGRAM,
        type: LocationType.PRIVATE,
        name: locationName,
        telegramChatId: BigInt(message.chat.id),
      } as LocationModel);
    await WorldManager.instance.setLocationPauseUpdateUntil(
      locationModel.id,
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 100) // pause update forever
    );

    await WorldManager.instance.addLocationAgent(
      locationModel.id,
      this.agent!.id
    );
    await WorldManager.instance.addLocationUser(locationModel.id, user.id);

    await WorldManager.instance.addLocationUserMessage(
      locationModel.id,
      user.id,
      user.nickname,
      text,
      new Date(message.date * 1000)
    );

    const typingInterval = setInterval(() => {
      this.sendChatAction(message.chat.id, 'typing').catch(() => {});
    }, 5000);
    void WorldManager.instance.updateLocation(
      Number(process.env.TELEGRAM_LLM_API_USER_ID),
      locationModel.id,
      {
        ignorePauseUpdateUntil: true,
        preAction: async (location) => {
          await this.locationUpdatePreAction(location);
        },
        postAction: async () => {
          clearInterval(typingInterval!);
        },
        handleSave: async (save) => {
          void this.handleSave(save);
        },
      }
    );
  }

  protected async handleCommand(
    user: UserModel,
    message: TelegramMessageDto,
    command: string,
    _args: string[]
  ): Promise<void> {
    if (message.chat.type !== 'private') {
      await this.sendChatAction(message.chat.id, 'typing');
      return;
    }
    switch (command) {
      case '/start':
        const ownerUser = await this.usersService.getUserModel(
          this.agent!.ownerUserId!
        );
        const ownerUsername = ownerUser.username
          ? `@${ownerUser.username}`
          : ownerUser.nickname;
        await this.sendChatTextMessage(
          message.chat.id,
          `Hello! This bot is <b>${this.agent!.name}</b>, powered by @samo_ai_bot. The bot was registered and configured by ${ownerUsername}, so if you have any questions about its assigned persona, please reach out to ${ownerUsername}.

When chatting with the bot in a private Telegram chat, $SAMOAI will be consumed.
If you invite and activate the bot in a group, it can interact with other group members.

For more information, please visit @samo_ai_bot. 🐾

⚠️ Note: <b>${this.agent!.name}</b> can make mistakes and is talking with multiple people at the same time. Please do not share any personal or confidential information.`
        );
        return;
    }
    return await this.handleTextMessage(
      user,
      message,
      message.from!,
      message.text!
    );
  }

  protected override async handleNewChatMembers(
    message: TelegramMessageDto,
    newChatMembers: TelegramUserDto[]
  ): Promise<void> {
    if (ENV.DEBUG) {
      this.logger.log(
        `[${this.name}] New chat members: ${newChatMembers.map((m) => m.id).join(', ')}`
      );
    }
  }

  protected override async handleLeftChatMember(
    message: TelegramMessageDto,
    leftChatMember: TelegramUserDto
  ): Promise<void> {
    if (ENV.DEBUG) {
      this.logger.log(`[${this.name}] Left chat member: ${leftChatMember.id}`);
    }
  }
}
