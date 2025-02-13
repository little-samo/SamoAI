import { UserModel } from '@prisma/client';
import { ENV } from '@common/config';
import { LocationMessage } from '@models/locations/states/location.messages-state';
import { WorldManager } from '@core/managers/world.manager';

import { TelegramMessageDto } from '../dto/telegram.message-dto';
import { TelegramUserDto } from '../dto/telegram.user-dto';
import { TELEGRAM_BOT_PRIVATE_LOCATION_META } from '../meta/location.meta';

import { TelegramAgentBot } from './telegram.agent-bot';

export const TELEGRAM_BOT_PRIVATE_LOCATION_PREFIX = 'TELEGRAM_BOT_PRIVATE';

export class TelegramChatBot extends TelegramAgentBot {
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
    const locationName = `${TELEGRAM_BOT_PRIVATE_LOCATION_PREFIX}/agent:${this.agent!.id}/user:${user.id}`;
    const locationModel =
      await this.locationsService.getOrCreateLocationModelByName(locationName);

    await WorldManager.instance.addLocationAgent(
      locationModel.id,
      this.agent!.id
    );
    await WorldManager.instance.addLocationUser(locationModel.id, user.id);

    const locationMessage = new LocationMessage();
    locationMessage.userId = user.id;
    locationMessage.name = user.nickname;
    locationMessage.message = text;
    await WorldManager.instance.addLocationMessage(
      locationModel.id,
      locationMessage
    );

    await WorldManager.instance.updateLocation(
      Number(process.env.TELEGRAM_LLM_API_USER_ID),
      locationModel.id,
      {
        preAction: async (location) => {
          location.meta = {
            ...TELEGRAM_BOT_PRIVATE_LOCATION_META,
            ...location.meta,
          };

          location.addAgentMessageHook(
            async (location, agent, agentMessage, expression) => {
              if (ENV.DEBUG) {
                this.logger.log(
                  `[${this.name}] Agent response: ${agentMessage} (${expression})`
                );
              }
              if (agentMessage) {
                await this.sendChatTextMessage(message.chat.id, agentMessage);
              }
            }
          );
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
        this.sendChatTextMessage(
          message.chat.id,
          `Hello! This bot is ${this.agent!.name}, powered by @samo_ai_bot. When you exchange private messages with the bot, $SAMOAI will be consumed. If you invite and activate the bot in a group, it can interact with other group members. For more information, please visit @samo_ai_bot. 🐾`
        );
        return;
    }
    return this.handleTextMessage(user, message, message.from!, message.text!);
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
