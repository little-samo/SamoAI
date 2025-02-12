import { TelegramMessageDto } from './telegram.message-dto';

export interface TelegramUpdateDto {
  update_id: number;
  message?: TelegramMessageDto;
  edited_message?: TelegramMessageDto;
  channel_post?: TelegramMessageDto;
  edited_channel_post?: TelegramMessageDto;
}
