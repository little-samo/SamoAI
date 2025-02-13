import { ENV } from '@common/config';
import { Logger } from '@nestjs/common';
import { UserModel } from '@prisma/client';

import { TelegramMessageDto } from '../dto/telegram.message-dto';
import { TelegramUserDto } from '../dto/telegram.user-dto';

import { TelegramBotCommands } from './telegram.bot-commands-decorator';
import { TelegramBot } from './telegram.bot';

@TelegramBotCommands([
  {
    command: 'list',
    description: 'List all registered bots.',
  },
  {
    command: 'register',
    description: 'Register a new bot.',
  },
  {
    command: 'set_api',
    description: 'Set the LLM API key for a bot.',
  },
  {
    command: 'delete',
    description: 'Delete a bot.',
  },
])
export class TelegramRegistrarBot extends TelegramBot {
  protected readonly logger = new Logger(TelegramRegistrarBot.name);

  protected override async handleTextMessage(
    user: UserModel,
    message: TelegramMessageDto,
    from: TelegramUserDto,
    text: string
  ): Promise<void> {
    if (ENV.DEBUG) {
      this.logger.log(
        `[${this.name}] Text message received: ${text} from ${from.id}`
      );
    }
    await this.sendCommands(message.chat.id);
  }

  protected override async handleCommand(
    user: UserModel,
    message: TelegramMessageDto,
    command: string,
    args: string[]
  ): Promise<void> {
    if (ENV.DEBUG) {
      this.logger.log(
        `[${this.name}] Command received: ${command} ${args.join(' ')}`
      );
    }
    switch (command) {
      case '/start':
        await this.sendChatForceReplyMessage(
          message.chat.id,
          'Force Reply Test',
          'Send Reply'
        );
        await this.sendReplyKeyboard(
          message.chat.id,
          'Empty Reply Keyboard Test',
          {
            keyboard: [[]],
          }
        );
        return;
      default:
        await this.sendCommands(message.chat.id);
    }
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
