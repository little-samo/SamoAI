import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';

import { TelegramService } from './telegram.service';
import { TelegramUpdateDto } from './dto/telegram.update-dto';

@Controller('telegram/webhook')
export class TelegramController {
  public constructor(private readonly telegramService: TelegramService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  public async receiveUpdate(
    @Headers() headers: Record<string, string>,
    @Body() update: TelegramUpdateDto
  ): Promise<void> {
    const secret = headers['x-telegram-bot-api-secret-token'];
    if (!secret) {
      throw new UnauthorizedException(
        'X-Telegram-Bot-Api-Secret-Token is required'
      );
    }
    const [num, ...rest] = secret.split('-');
    const token = `${num}:${rest.join('-')}`;
    await this.telegramService.handleUpdate(token, update);
  }
}
