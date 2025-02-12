import { TelegramBotCommandDto } from '../dto/telegram.bot-command-dto';

export const TELEGRAM_COMMANDS_METADATA_KEY = 'telegram:commands';

export function TelegramBotCommands(
  commands: TelegramBotCommandDto[]
): ClassDecorator {
  return function (target: object) {
    Reflect.defineMetadata(TELEGRAM_COMMANDS_METADATA_KEY, commands, target);
  };
}
