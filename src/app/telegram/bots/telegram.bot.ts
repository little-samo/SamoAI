import { Logger, HttpException } from '@nestjs/common';
import { fetch } from 'undici';
import { ENV } from '@common/config';
import { sleep } from '@common/utils/sleep';
import { PrismaService } from '@app/prisma/prisma.service';
import { AgentsService } from '@app/agents/agents.service';
import { UsersService } from '@app/users/users.service';
import { UserModel } from '@prisma/client';
import { LocationsService } from '@app/locations/locations.service';

import { TelegramUpdateDto } from '../dto/telegram.update-dto';
import { TelegramMessageDto } from '../dto/telegram.message-dto';
import { TelegramUserDto } from '../dto/telegram.user-dto';
import {
  TelegramBotCommandDto,
  TelegramBotCommandScopeDto,
} from '../dto/telegram.bot-command-dto';
import { TelegramInlineKeyboardMarkupDto } from '../dto/telegram.inline-keyboard-markup-dto';
import {
  TelegramReplyKeyboardMarkupDto,
  TelegramReplyKeyboardRemoveDto,
} from '../dto/telegram.reply-keyboard-markup';
import { TelegramService } from '../telegram.service';
import { TelegramCallbackQueryDto } from '../dto/telegram.callback-query-dto';

import { TELEGRAM_COMMANDS_METADATA_KEY } from './telegram.bot-commands-decorator';

export enum TelegramBotMethod {
  GetMe = 'getMe',

  SetWebhook = 'setWebhook',
  DeleteWebhook = 'deleteWebhook',

  SetMyCommands = 'setMyCommands',

  SendChatAction = 'sendChatAction',
  SendMessage = 'sendMessage',

  AnswerCallbackQuery = 'answerCallbackQuery',
  EditMessageReplyMarkup = 'editMessageReplyMarkup',
}

interface TelegramCallOptions {
  maxRetries?: number;
  token?: string;
}

export abstract class TelegramBot {
  protected readonly logger = new Logger(TelegramBot.name);

  public constructor(
    protected readonly telegram: TelegramService,
    protected readonly prisma: PrismaService,
    protected readonly usersService: UsersService,
    protected readonly agentsService: AgentsService,
    protected readonly locationsService: LocationsService,
    public readonly name: string,
    public readonly token: string
  ) {}

  public async call(
    method: TelegramBotMethod,
    params: Record<string, unknown> = {},
    options: TelegramCallOptions = {}
  ): Promise<unknown> {
    const { maxRetries = 5, token = this.token } = options;
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const body = JSON.stringify(params);
    if (ENV.DEBUG) {
      this.logger.log(`[${this.name}] Calling ${url} with body: ${body}`);
    }
    for (let i = 0; i < maxRetries; i++) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
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
        this.logger.error(
          `Failed to call ${method}: ${response.statusText} ${await response.text()}`
        );
        throw new HttpException(
          `Failed to call Telegram API ${method}: ${response.statusText}`,
          response.status
        );
      }
      const json = (await response.json()) as { result: unknown };
      if (ENV.DEBUG) {
        this.logger.log(`[${this.name}] Response: ${JSON.stringify(json)}`);
      }
      return json.result;
    }
  }

  public async getMe(token?: string): Promise<TelegramUserDto> {
    return (await this.call(
      TelegramBotMethod.GetMe,
      {},
      { token }
    )) as TelegramUserDto;
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
        secret_token: this.token,
        allowed_updates: ['message', 'callback_query'],
      });
      if (ENV.DEBUG) {
        this.logger.log(`[${this.name}] Webhook registered`);
      }

      return this.token;
    } catch (error) {
      this.logger.error(`Failed to register webhook: ${error}`);
      return null;
    }
  }

  public async deleteWebhook(): Promise<void> {
    await this.call(TelegramBotMethod.DeleteWebhook);
  }

  public async setMyCommands(
    commands?: TelegramBotCommandDto[],
    scope?: TelegramBotCommandScopeDto
  ): Promise<void> {
    commands ??= Reflect.getMetadata(
      TELEGRAM_COMMANDS_METADATA_KEY,
      this.constructor
    ) as TelegramBotCommandDto[] | [];

    await this.call(TelegramBotMethod.SetMyCommands, {
      commands,
      scope,
    });
    if (ENV.DEBUG) {
      this.logger.log(`[${this.name}] Commands registered`);
    }
  }

  public async handleUpdate(update: TelegramUpdateDto): Promise<void> {
    try {
      if (update.callback_query) {
        return await this.handleCallbackQuery(update.callback_query);
      }
      if (update.message) {
        return await this.handleMessage(update.message);
      }
    } catch (error) {
      this.logger.error(`Failed to handle update: ${error}`);
    }
  }

  protected async handleMessage(message: TelegramMessageDto): Promise<void> {
    const isPrivateChat = message.chat.type === 'private';
    if (message.from && message.text) {
      if (isPrivateChat) {
        await this.sendChatAction(message.chat.id);
      }

      const user = await this.usersService.getOrCreateTelegramUserModel(
        message.from.id,
        message.from.first_name,
        message.from.last_name,
        message.from.username
      );

      if (message.text.startsWith('/')) {
        const [command, ...args] = message.text.split(' ');
        return await this.handleCommand(user, message, command, args);
      }
      return await this.handleTextMessage(
        user,
        message,
        message.from,
        message.text
      );
    }
    if (message.new_chat_members) {
      return await this.handleNewChatMembers(message, message.new_chat_members);
    }
    if (message.left_chat_member) {
      return await this.handleLeftChatMember(message, message.left_chat_member);
    }

    if (isPrivateChat) {
      return await this.sendCommands(message.chat.id);
    }
  }

  protected async handleCallbackQuery(
    query: TelegramCallbackQueryDto
  ): Promise<void> {
    if (!query.data || !query.message) {
      return await this.answerCallbackQuery(query.id);
    }

    const user = await this.usersService.getOrCreateTelegramUserModel(
      query.from.id,
      query.from.first_name,
      query.from.last_name,
      query.from.username
    );

    const [command, ...args] = query.data.split(' ');
    await this.handleCommand(user, query.message, command, args);
    return await this.answerCallbackQuery(query.id);
  }

  protected abstract handleTextMessage(
    user: UserModel,
    message: TelegramMessageDto,
    from: TelegramUserDto,
    text: string
  ): Promise<void>;

  protected abstract handleCommand(
    user: UserModel,
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

  public async sendCommands(chat_id: number): Promise<void> {
    const commands = Reflect.getMetadata(
      TELEGRAM_COMMANDS_METADATA_KEY,
      this.constructor
    ) as TelegramBotCommandDto[] | [];
    await this.sendChatTextMessage(
      chat_id,
      `Commands:\n${commands
        .map((c) => `/${c.command} - ${c.description}`)
        .join('\n')}`
    );
  }

  public async sendChatAction(
    chat_id: number,
    action: string = 'typing'
  ): Promise<void> {
    await this.call(TelegramBotMethod.SendChatAction, {
      chat_id,
      action,
    });
  }

  public async sendChatTextMessage(
    chat_id: number,
    text: string,
    parse_mode: 'HTML' | 'MarkdownV2' = 'HTML'
  ): Promise<void> {
    await this.call(TelegramBotMethod.SendMessage, {
      chat_id,
      text,
      parse_mode,
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

  public async sendInlineKeyboard(
    chat_id: number,
    text: string,
    keyboard: TelegramInlineKeyboardMarkupDto
  ): Promise<void> {
    await this.call(TelegramBotMethod.SendMessage, {
      chat_id,
      text,
      reply_markup: keyboard,
    });
  }

  public async sendReplyKeyboard(
    chat_id: number,
    text: string,
    keyboard: TelegramReplyKeyboardMarkupDto
  ): Promise<void> {
    await this.call(TelegramBotMethod.SendMessage, {
      chat_id,
      text,
      reply_markup: keyboard,
    });
  }

  public async sendReplyKeyboardRemove(
    chat_id: number,
    remove_keyboard: TelegramReplyKeyboardRemoveDto = {
      remove_keyboard: true,
    }
  ): Promise<void> {
    await this.call(TelegramBotMethod.SendMessage, {
      chat_id,
      reply_markup: remove_keyboard,
    });
  }

  public async answerCallbackQuery(
    callback_query_id: string,
    text?: string
  ): Promise<void> {
    await this.call(TelegramBotMethod.AnswerCallbackQuery, {
      callback_query_id,
      text,
    });
  }

  public async editMessageReplyMarkup(
    chat_id: number,
    message_id: number,
    reply_markup: TelegramInlineKeyboardMarkupDto
  ): Promise<void> {
    await this.call(TelegramBotMethod.EditMessageReplyMarkup, {
      chat_id,
      message_id,
      reply_markup,
    });
  }
}
