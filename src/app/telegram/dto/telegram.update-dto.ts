import { TelegramMessageDto } from './telegram.message-dto';
import { TelegramCallbackQueryDto } from './telegram.callback-query-dto';

export interface TelegramUpdateDto {
  update_id: number;
  message?: TelegramMessageDto;
  edited_message?: TelegramMessageDto;
  channel_post?: TelegramMessageDto;
  edited_channel_post?: TelegramMessageDto;
  callback_query?: TelegramCallbackQueryDto;
}
