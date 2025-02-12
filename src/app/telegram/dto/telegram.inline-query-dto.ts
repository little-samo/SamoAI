import { TelegramUserDto } from "./telegram.user-dto";

export interface TelegramInlineQueryDto {
  id: string; // Unique identifier for this query
  from: TelegramUserDto; // Sender
  query: string; // Text of the query
  offset: string; // Offset of the results to be returned, can be controlled by the bot
}
