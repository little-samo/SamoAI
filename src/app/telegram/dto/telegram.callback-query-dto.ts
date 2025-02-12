import { TelegramUserDto } from './telegram.user-dto';

export interface TelegramCallbackQueryDto {
  id: string; // Unique identifier for this query
  from: TelegramUserDto; // Sender
  chat_instance: string; // Global identifier, uniquely corresponding to the chat to which the message with the callback button was sent. Useful for high scores in games.
  data?: string; // Data associated with the callback button. Be aware that the message originated the query can contain no callback buttons with this data.
}
