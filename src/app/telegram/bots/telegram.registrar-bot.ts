import { ENV } from '@common/config';
import { Logger } from '@nestjs/common';

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
    message: TelegramMessageDto,
    from: TelegramUserDto,
    text: string
  ): Promise<void> {
    if (ENV.DEBUG) {
      this.logger.log(
        `[${this.name}] Text message received: ${text} from ${from.id}`
      );
    }
  }

  protected override async handleCommand(
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
        return await this.sendChatForceReplyMessage(
          message.chat.id,
          'Force Reply Test',
          'Send Reply'
        );
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
