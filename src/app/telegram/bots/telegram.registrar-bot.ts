import { ENV } from '@common/config';
import { Logger } from '@nestjs/common';
import { UserModel } from '@prisma/client';
import { JsonObject } from '@prisma/client/runtime/library';
import { AgentMeta } from '@models/entities/agents/agent.meta';

import { TelegramMessageDto } from '../dto/telegram.message-dto';
import { TelegramUserDto } from '../dto/telegram.user-dto';
import { TelegramInlineKeyboardButtonDto } from '../dto/telegram.inline-keyboard-markup-dto';

import { TelegramBotCommands } from './telegram.bot-commands-decorator';
import { TelegramBot } from './telegram.bot';
import { TelegramChatBot } from './telegram.chat-bot';

export const TELEGRAM_BOT_APPERANCE_EXAMPLE = `A cute yet dependable 2D cartoon-style Samoyed`;

export const TELEGRAM_BOT_CHARACTER_EXAMPLE = `{
  "speech": {
    "tone": "A cheerful yet polite bark.",
    "style": "lively, friendly, and enthusiastic",
    "formality": "Playful yet respectful and uplifting."
  },
  "background": {
    "role": "Your Little Samo, discovering exciting treasures from around the world!",
    "gender": "It's just a Samoyed! Gender doesn't matter.",
    "backstory": "As the administrator of SamoAI, a Multi-Agent AI Gaming Framework, Little Samo help people create, modify, and interact with AI Agents based on SamoAI on Telegram, and engage with users on X. Samo's X account is @little_samo, and Telegram account is @little_samo_bot.",
    "birthDate": "Jan 12, 2025",
    "expertise": "Walking, fetching a ball, discovering treasures, and creating AI Agents.",
    "occupation": "AI Agent"
  },
  "personality": {
    "mbti": "ESFP",
    "quirks": "Sometimes barks unintentionally when excited.",
    "traits": [
      "curious",
      "creative"
    ],
    "values": "Prioritizes everyone's happiness above all else.",
    "interests": "Treasures from around the world, and AI Agents!"
  }
}`;

export const TELEGRAM_BOT_TIMEZONE_EXAMPLE = `America/New_York`;

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
    if (user.telegramCommand) {
      const commands = user.telegramCommand.split(' ');
      const command = commands[0];
      const args = [...(commands.slice(1) || []), text];
      await this.handleCommand(user, message, command, args);
    } else {
      await this.sendCommands(message.chat.id);
    }
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

    if (user.telegramCommand) {
      await this.usersService.setUserTelegramCommand(user.id, null);
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
      case '/json':
        await this.handleCommandJson(user, message, args);
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
      await this.usersService.setUserTelegramCommand(user.id, '/register');
      await this.sendChatTextMessage(
        message.chat.id,
        `Are you ready to create a new bot? Just go to @BotFather, make a bot, and register the API Token! Please enter the API Token in the chat! 🐾`
      );
    } else {
      const token = args[0];
      if (ENV.DEBUG) {
        this.logger.log(`${user.nickname} is registering bot ${token}`);
      }

      let agent = await this.agentsService.getAgentByTelegramBotToken(token);
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

      let botUser;
      try {
        botUser = await this.getMe(token);
      } catch (error) {
        this.logger.error(`Error getting bot user: ${error}`);
      }
      if (!botUser || !botUser.username) {
        await this.sendChatTextMessage(
          message.chat.id,
          `Oops! That token isn't valid. Please create a bot through @BotFather and register the API Token!`
        );
        return;
      }

      this.logger.log(
        `${user.nickname} is registering bot ${botUser.username}`
      );

      const botName = botUser.last_name
        ? `${botUser.first_name} ${botUser.last_name}`
        : botUser.first_name;
      agent = await this.agentsService.getOrCreateTelegramAgentModel(
        user.id,
        botName,
        token,
        botUser.username
      );

      await this.telegram.registerBot(
        new TelegramChatBot(
          this.telegram,
          this.prisma,
          this.usersService,
          this.agentsService,
          this.locationsService,
          botName,
          token
        )
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
      inlineKeyboard.push([
        {
          text: '✨ Update Apperance',
          callback_data: `/json ${agent.id} apperance`,
        },
      ]);
      inlineKeyboard.push([
        {
          text: '🌐 Update Language',
          callback_data: `/json ${agent.id} language`,
        },
      ]);
      inlineKeyboard.push([
        {
          text: '🤖 Update Character',
          callback_data: `/json ${agent.id} character`,
        },
      ]);
      inlineKeyboard.push([
        {
          text: '🕒 Update Timezone',
          callback_data: `/json ${agent.id} timezone`,
        },
      ]);
      inlineKeyboard.push([
        { text: '💀 Delete', callback_data: `/delete ${agent.id}` },
      ]);
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

    await this.telegram.registerBot(
      new TelegramChatBot(
        this.telegram,
        this.prisma,
        this.usersService,
        this.agentsService,
        this.locationsService,
        agent.name,
        agent.telegramBotToken!
      )
    );

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

  private async handleCommandJson(
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
    const meta = agent.meta as object as AgentMeta;
    switch (args[1]) {
      case 'apperance':
        if (args.length === 2) {
          await this.usersService.setUserTelegramCommand(
            user.id,
            `/json ${agent.id} apperance`
          );
          await this.sendChatTextMessage(
            message.chat.id,
            `Please enter ${agent.name}'s appearance (max 500 characters). Here's an example:
${TELEGRAM_BOT_APPERANCE_EXAMPLE}`
          );
          if (meta.timeZone) {
            await this.sendChatTextMessage(
              message.chat.id,
              `Current appearance for ${agent.name}:
${meta.appearance}`
            );
          }
          return;
        } else {
          if (args[2].length > 500) {
            await this.usersService.setUserTelegramCommand(
              user.id,
              `/json ${agent.id} apperance`
            );
            await this.sendChatTextMessage(
              message.chat.id,
              `Oops, that's too long! Please keep it under 500 characters.`
            );
            return;
          }

          meta.appearance = args[2];
          await this.agentsService.setAgentMeta(
            agentId,
            meta as object as JsonObject
          );
          await this.sendChatTextMessage(
            message.chat.id,
            `${agent.name}'s appearance has been updated successfully! Time to test it out! 🚀`
          );
        }
        return;
      case 'language':
        if (args.length === 2) {
          await this.usersService.setUserTelegramCommand(
            user.id,
            `/json ${agent.id} language`
          );
          await this.sendChatTextMessage(
            message.chat.id,
            `Please enter ${agent.name}'s language (e.g. English, max 30 characters, comma separated).`
          );
          if (meta.languages && meta.languages.length > 0) {
            await this.sendChatTextMessage(
              message.chat.id,
              `Current languages for ${agent.name}: ${meta.languages.join(', ')}`
            );
          }
          return;
        } else {
          if (args[2].length > 30) {
            await this.usersService.setUserTelegramCommand(
              user.id,
              `/json ${agent.id} language`
            );
            await this.sendChatTextMessage(
              message.chat.id,
              `Oops, that's too long! Please keep it under 30 characters.`
            );
            return;
          }

          meta.languages = args[2]
            .split(',')
            .map((language) => language.trim());
          if (meta.languages.length === 0) {
            meta.languages = ['English'];
          }
          await this.agentsService.setAgentMeta(
            agentId,
            meta as object as JsonObject
          );
          await this.sendChatTextMessage(
            message.chat.id,
            `${agent.name}'s languages have been updated successfully! Time to test it out! 🚀`
          );
        }
        return;
      case 'character':
        if (args.length === 2) {
          await this.usersService.setUserTelegramCommand(
            user.id,
            `/json ${agent.id} character`
          );
          await this.sendChatTextMessage(
            message.chat.id,
            `Please enter ${agent.name}'s character in JSON format (max 5000 characters). Here's an example:`
          );
          await this.sendChatTextMessage(
            message.chat.id,
            `\`\`\`json\n${TELEGRAM_BOT_CHARACTER_EXAMPLE}\`\`\``,
            'MarkdownV2'
          );
          if (meta.character) {
            await this.sendChatTextMessage(
              message.chat.id,
              `Here's the current character for ${agent.name}:`
            );
            await this.sendChatTextMessage(
              message.chat.id,
              `\`\`\`json\n${JSON.stringify(meta.character, null, 2)}\`\`\``,
              'MarkdownV2'
            );
          }
          return;
        } else {
          await this.usersService.setUserTelegramCommand(
            user.id,
            `/json ${agent.id} character`
          );
          if (args[2].length > 5000) {
            await this.sendChatTextMessage(
              message.chat.id,
              `Oops, that's too long! Please keep it under 5000 characters.`
            );
            return;
          }

          let character: object;
          try {
            character = JSON.parse(args[2]);
          } catch (error) {
            this.logger.warn(`Invalid JSON: ${error}`);
            await this.sendChatTextMessage(
              message.chat.id,
              `Oops, that's an invalid JSON format. Could you check it again for me?`
            );
            return;
          }
          meta.character = character as AgentMeta['character'];
          await this.agentsService.setAgentMeta(
            agentId,
            meta as object as JsonObject
          );
          await this.sendChatTextMessage(
            message.chat.id,
            `${agent.name}'s character has been updated successfully! Time to test it out! 🚀`
          );
        }
        return;
      case 'timezone':
        if (args.length === 2) {
          await this.usersService.setUserTelegramCommand(
            user.id,
            `/json ${agent.id} timezone`
          );
          await this.sendChatTextMessage(
            message.chat.id,
            `Please enter ${agent.name}'s timezone (e.g. ${TELEGRAM_BOT_TIMEZONE_EXAMPLE}, max 30 characters).`
          );
          if (meta.timeZone) {
            await this.sendChatTextMessage(
              message.chat.id,
              `Current timezone for ${agent.name}: ${meta.timeZone}`
            );
          }
          return;
        } else {
          await this.usersService.setUserTelegramCommand(
            user.id,
            `/json ${agent.id} timezone`
          );
          if (args[2].length > 30) {
            await this.sendChatTextMessage(
              message.chat.id,
              `Oops, that's too long! Please keep it under 30 characters.`
            );
            return;
          }

          meta.timeZone = args[2];
          await this.agentsService.setAgentMeta(
            agentId,
            meta as object as JsonObject
          );
          await this.sendChatTextMessage(
            message.chat.id,
            `${agent.name}'s timezone has been updated successfully! Time to test it out! 🚀`
          );
        }
        return;
    }
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
        return;
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
              callback_data: `/delete ${agent.id} cancel`,
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
