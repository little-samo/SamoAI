import { ENV } from '@common/config';
import { Logger } from '@nestjs/common';
import { UserModel } from '@prisma/client';

import { TelegramMessageDto } from '../dto/telegram.message-dto';
import { TelegramUserDto } from '../dto/telegram.user-dto';
import { TelegramInlineKeyboardButtonDto } from '../dto/telegram.inline-keyboard-markup-dto';

import { TelegramBotCommands } from './telegram.bot-commands-decorator';
import { TelegramBot } from './telegram.bot';

@TelegramBotCommands([
  {
    command: 'register',
    description: 'Register a new bot.',
  },
  {
    command: 'manage',
    description: 'Manage a bot.',
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
        await this.sendInlineKeyboard(
          message.chat.id,
          `Hey there, ${user.nickname}! I'm the Samo AI Bot, your friendly Samoyed, here to help you create, tweak, and manage bots powered by Samo AI! 🦴✨ Tap the button below to get your very first bot up and running!`,
          {
            inline_keyboard: [
              [{ text: '🚀 Register', callback_data: '/register' }],
            ],
          }
        );
        return;
      case '/register':
        await this.handleCommandRegister(user, message, args);
        return;
      case '/manage':
        await this.handleCommandManage(user, message, args);
        return;
      case '/activate':
        await this.handleCommandActivate(user, message, args);
        return;
      case '/deactivate':
        await this.handleCommandDeactivate(user, message, args);
        return;
      case '/delete':
        await this.handleCommandDelete(user, message, args);
        return;
      default:
        await this.sendCommands(message.chat.id);
    }
  }

  private async handleCommandRegister(
    user: UserModel,
    message: TelegramMessageDto,
    args: string[]
  ): Promise<void> {
    if (args.length === 0) {
      await this.sendChatForceReplyMessage(
        message.chat.id,
        `/register\nAre you ready to create a new bot? Just go to @BotFather, make a bot, and register the API Token! Please enter the API Token in the chat! 🐾`,
        'API Token'
      );
    } else {
      const token = args[0];
      const agent = await this.agentsService.getAgentByTelegramBotToken(token);
      if (agent) {
        if (agent.ownerUserId !== user.id) {
          await this.sendChatTextMessage(
            message.chat.id,
            'This bot is already registered to another user!'
          );
        } else {
          await this.sendChatTextMessage(
            message.chat.id,
            'This bot is already registered!'
          );
        }
        return;
      }

      const botUser = await this.getMe(token);
      if (!botUser) {
        await this.sendChatTextMessage(
          message.chat.id,
          `Oops! That token isn't valid. Please create a bot through @BotFather and register the API Token!`
        );
        return;
      }

      const botName = botUser.last_name
        ? `${botUser.first_name} ${botUser.last_name}`
        : botUser.first_name;
      await this.agentsService.getOrCreateTelegramAgentModel(
        user.id,
        botName,
        token,
        botUser.username
      );

      await this.sendChatTextMessage(
        message.chat.id,
        `All set! 🎉 Your bot is registered successfully! You can now manage it using the /manage command.`
      );
    }
  }

  private async handleCommandManage(
    user: UserModel,
    message: TelegramMessageDto,
    args: string[]
  ): Promise<void> {
    if (args.length === 0) {
      const agents = await this.agentsService.getAllAgentsByOwnerUserId(
        user.id
      );
      if (agents.length === 0) {
        await this.sendChatTextMessage(
          message.chat.id,
          `Hmm... I couldn't find any agents!`
        );
        return;
      }

      const inlineKeyboard: TelegramInlineKeyboardButtonDto[][] = [];
      for (let i = 0; i < agents.length; i += 2) {
        const row: TelegramInlineKeyboardButtonDto[] = [];
        row.push({
          text: agents[i].telegramUsername
            ? `@${agents[i].telegramUsername}`
            : agents[i].name,
          callback_data: `/manage ${agents[i].id}`,
        });
        if (agents[i + 1]) {
          row.push({
            text: agents[i + 1].telegramUsername
              ? `@${agents[i + 1].telegramUsername}`
              : agents[i + 1].name,
            callback_data: `/manage ${agents[i + 1].id}`,
          });
        }
        inlineKeyboard.push(row);
      }

      await this.sendInlineKeyboard(
        message.chat.id,
        `Which bot would you like to edit? Pick one from the list! 🐾`,
        { inline_keyboard: inlineKeyboard }
      );
    } else {
      const agentId = parseInt(args[0]);
      const agent = await this.agentsService.getAgentModel(agentId);
      if (!agent || agent.ownerUserId !== user.id) {
        await this.sendChatTextMessage(
          message.chat.id,
          `I can't find that bot. It might have already been deleted!`
        );
        return;
      }

      const inlineKeyboard: TelegramInlineKeyboardButtonDto[][] = [];
      if (agent.isActive) {
        inlineKeyboard.push([
          { text: '⛔ Deactivate', callback_data: `/deactivate ${agent.id}` },
        ]);
      } else {
        inlineKeyboard.push([
          { text: '✅ Activate', callback_data: `/activate ${agent.id}` },
        ]);
      }
      await this.sendInlineKeyboard(
        message.chat.id,
        `${agent.name}${
          agent.telegramUsername ? ` (@${agent.telegramUsername})` : ''
        } is currently ${agent.isActive ? '✅ Active' : '⛔ Inactive'}. What would you like to do next? Pick an option!`,
        { inline_keyboard: inlineKeyboard }
      );
    }
  }

  private async handleCommandActivate(
    user: UserModel,
    message: TelegramMessageDto,
    args: string[]
  ): Promise<void> {
    const agentId = parseInt(args[0]);
    const agent = await this.agentsService.getAgentModel(agentId);
    if (!agent || agent.ownerUserId !== user.id) {
      await this.sendChatTextMessage(
        message.chat.id,
        `I can't find that bot. It might have already been deleted!`
      );
      return;
    }

    await this.agentsService.setAgentActive(agentId, true);
    await this.sendChatTextMessage(
      message.chat.id,
      `${agent.name} is now ✅ Active! 🎉`
    );
  }

  private async handleCommandDeactivate(
    user: UserModel,
    message: TelegramMessageDto,
    args: string[]
  ): Promise<void> {
    const agentId = parseInt(args[0]);
    const agent = await this.agentsService.getAgentModel(agentId);
    if (!agent || agent.ownerUserId !== user.id) {
      await this.sendChatTextMessage(
        message.chat.id,
        `I can't find that bot. It might have already been deleted!`
      );
      return;
    }

    await this.agentsService.setAgentActive(agentId, false);
    await this.sendChatTextMessage(
      message.chat.id,
      `${agent.name} is now ⛔ Inactive!`
    );
  }

  private async handleCommandDelete(
    user: UserModel,
    message: TelegramMessageDto,
    args: string[]
  ): Promise<void> {
    const agentId = parseInt(args[0]);
    const agent = await this.agentsService.getAgentModel(agentId);
    if (!agent || agent.ownerUserId !== user.id) {
      await this.sendChatTextMessage(
        message.chat.id,
        `I can't find that bot. It might have already been deleted!`
      );
      return;
    }

    if (args.length > 1) {
      if (args[1] === 'confirm') {
        await this.agentsService.deleteAgentModel(agentId);
        await this.sendChatTextMessage(
          message.chat.id,
          `${agent.name} has been deleted. 😢 Bye-bye! You can create a new one anytime with /register!`
        );
        return;
      } else if (args[1] === 'cancel') {
        try {
          await this.editMessageReplyMarkup(
            message.chat.id,
            message.message_id,
            { inline_keyboard: [] }
          );
        } catch (error) {
          this.logger.error(error);
        }
        await this.sendChatTextMessage(
          message.chat.id,
          `Great choice! ${agent.name} is still safe and sound. ❤️`
        );
      }
    }

    await this.sendInlineKeyboard(
      message.chat.id,
      `Are you sure you want to delete ${agent.name}? This action cannot be undone. 💔`,
      {
        inline_keyboard: [
          [
            {
              text: '💀 Confirm',
              callback_data: `/delete ${agent.id} confirm`,
            },
          ],
          [
            {
              text: '❤️ Cancel',
              callback_data: `/manage ${agent.id} cancel`,
            },
          ],
        ],
      }
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
