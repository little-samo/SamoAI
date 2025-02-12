import { TelegramBotCommandDto } from '../dto/telegram.bot-command-dto';
import { TelegramMessageDto } from '../dto/telegram.message-dto';
import { TelegramUserDto } from '../dto/telegram.user-dto';

import { TelegramBot } from './telegram.bot';

export class TelegramRegistrarBot extends TelegramBot {
  public static readonly COMMANDS: TelegramBotCommandDto[] = [
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
  ];

  protected override async handleTextMessage(
    message: TelegramMessageDto,
    from: TelegramUserDto,
    text: string
  ): Promise<void> {
    throw new Error('Method not implemented.');
  }

  protected override async handleCommand(
    message: TelegramMessageDto,
    command: string,
    args: string[]
  ): Promise<void> {
    switch (command) {
      case 'start':
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
    throw new Error('Method not implemented.');
  }

  protected override async handleLeftChatMember(
    message: TelegramMessageDto,
    leftChatMember: TelegramUserDto
  ): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
