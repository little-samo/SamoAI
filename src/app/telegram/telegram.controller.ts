import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import { TelegramService } from './telegram.service';
import { TelegramUpdateDto } from './dto/telegram.update-dto';

@Controller('telegram/webhook')
export class TelegramController {
  public constructor(private readonly telegramService: TelegramService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  public async receiveUpdate(
    @Req() req: Request,
    @Body() update: TelegramUpdateDto
  ): Promise<void> {
    const secret = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (!secret) {
      throw new UnauthorizedException(
        'X-Telegram-Bot-Api-Secret-Token is required'
      );
    }
    await this.telegramService.handleUpdate(secret, update);
  }
}
