import { randomBytes } from 'crypto';

import { Logger, HttpException } from '@nestjs/common';
import { fetch } from 'undici';
import { ENV } from '@common/config';
import { sleep } from '@common/utils/sleep';

import { TelegramUpdateDto } from '../dto/telegram.update-dto';
import { TelegramMessageDto } from '../dto/telegram.message-dto';
import { TelegramUserDto } from '../dto/telegram.user-dto';
import { TelegramBotCommandDto } from '../dto/telegram.bot-command-dto';

import { TELEGRAM_COMMANDS_METADATA_KEY } from './telegram.bot-commands-decorator';

export enum TelegramBotMethod {
  SetWebhook = 'setWebhook',
  DeleteWebhook = 'deleteWebhook',

  SetMyCommands = 'setMyCommands',

  SendMessage = 'sendMessage',
}

export abstract class TelegramBot {
  protected readonly logger = new Logger(TelegramBot.name);

  private readonly secret: string;

  public constructor(
    public readonly name: string,
    public readonly token: string
  ) {
    this.secret = randomBytes(32).toString('hex');
  }

  public async call(
    method: TelegramBotMethod,
    params: Record<string, unknown> = {},
    maxRetries: number = 5
  ): Promise<unknown> {
    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        });
        if (response.status === 429 && i < maxRetries - 1) {
          const retryAfter = i + 1;
          this.logger.warn(
            `[${this.name}] Telegram API rate limited, retrying in ${retryAfter} seconds`
          );
          await sleep(retryAfter * 1000);
          continue;
        }
        if (!response.ok) {
          this.logger.error(`Failed to call ${method}: ${response.statusText}`);
          throw new HttpException(
            `Failed to call Telegram API ${method}: ${response.statusText}`,
            response.status
          );
        }
        return response.json();
      } catch (error) {
        this.logger.error(`Failed to call ${method}: ${error}`);
      }
    }
  }

  public async registerWebhook(): Promise<string | null> {
    const baseUrl = process.env.TELEGRAM_WEBHOOK_BASE_URL;
    if (!baseUrl) {
      this.logger.warn(
        'TELEGRAM_WEBHOOK_BASE_URL is not set, Telegram bot will not be able to receive updates.'
      );
      return null;
    }
    try {
      const webhookUrl = `${baseUrl}/telegram/webhook`;
      await this.call(TelegramBotMethod.SetWebhook, {
        url: webhookUrl,
        max_connections: 4,
        secret_token: this.secret,
        allowed_updates: ['message', 'callback_query'],
      });
      if (ENV.DEBUG) {
        this.logger.log(`[${this.name}] Webhook registered`);
      }

      const commands = Reflect.getMetadata(
        TELEGRAM_COMMANDS_METADATA_KEY,
        this.constructor
      ) as TelegramBotCommandDto[];
      await this.call(TelegramBotMethod.SetMyCommands, {
        commands,
      });
      if (ENV.DEBUG) {
        this.logger.log(`[${this.name}] Commands registered`);
      }

      return this.secret;
    } catch (error) {
      this.logger.error(`Failed to register webhook: ${error}`);
      return null;
    }
  }

  public async deleteWebhook(): Promise<void> {
    await this.call(TelegramBotMethod.DeleteWebhook);
  }

  public async handleUpdate(update: TelegramUpdateDto): Promise<void> {
    if (update.message) {
      await this.handleMessage(update.message);
    }
  }

  protected async handleMessage(message: TelegramMessageDto): Promise<void> {
    if (message.from && message.text) {
      //   if (message.reply_to_message?.reply) {
      //     return await this.handleReply(message, message.reply_to_message);
      //   }
      if (message.text.startsWith('/')) {
        const [command, ...args] = message.text.slice(1).split(' ');
        return await this.handleCommand(message, command, args);
      }
      return await this.handleTextMessage(message, message.from, message.text);
    }
    if (message.new_chat_members) {
      return await this.handleNewChatMembers(message, message.new_chat_members);
    }
    if (message.left_chat_member) {
      return await this.handleLeftChatMember(message, message.left_chat_member);
    }
  }

  protected abstract handleTextMessage(
    message: TelegramMessageDto,
    from: TelegramUserDto,
    text: string
  ): Promise<void>;

  protected abstract handleCommand(
    message: TelegramMessageDto,
    command: string,
    args: string[]
  ): Promise<void>;

  protected abstract handleNewChatMembers(
    message: TelegramMessageDto,
    newChatMembers: TelegramUserDto[]
  ): Promise<void>;

  protected abstract handleLeftChatMember(
    message: TelegramMessageDto,
    leftChatMember: TelegramUserDto
  ): Promise<void>;

  public async sendChatTextMessage(
    chat_id: number,
    text: string
  ): Promise<void> {
    await this.call(TelegramBotMethod.SendMessage, {
      chat_id,
      text,
      parse_mode: 'MarkdownV2',
    });
  }

  public async sendChatForceReplyMessage(
    chat_id: number,
    text: string,
    placeholder?: string
  ): Promise<void> {
    await this.call(TelegramBotMethod.SendMessage, {
      chat_id,
      text,
      reply_markup: {
        force_reply: true,
        input_field_placeholder: placeholder,
      },
    });
  }
}
