import { TelegramChatDto } from './telegram.chat-dto';
import { TelegramUserDto } from './telegram.user-dto';

export interface TelegramMessageDto {
  message_id: number; // 	Unique message identifier inside this chat. In specific instances (e.g., message containing a video sent to a big chat), the server might automatically schedule a message instead of sending it immediately. In such cases, this field will be 0 and the relevant message will be unusable until it is actually sent
  message_thread_id?: number; // Unique identifier of a message thread to which the message belongs; for supergroups only
  from?: TelegramUserDto; // Sender of the message; may be empty for messages sent to channels. For backward compatibility, if the message was sent on behalf of a chat, the field contains a fake sender user in non-channel chats
  sender_chat?: TelegramChatDto; // Optional. Sender of the message when sent on behalf of a chat. For example, the supergroup itself for messages sent by its anonymous administrators or a linked channel for messages automatically forwarded to the channel's discussion group. For backward compatibility, if the message was sent on behalf of a chat, the field from contains a fake sender user in non-channel chats.
  date: number; // Date the message was sent in Unix time. It is always a positive number, representing a valid date.
  chat: TelegramChatDto; // Information about the original message for forwarded messages
  edit_date?: number; // Date the message was last edited in Unix time.
  text?: string; // For text messages, the actual UTF-8 text of the message, 0-4096 characters.
  reply_to_message?: TelegramMessageDto; // For replies in the same chat and message thread, the original message. Note that the Message object in this field will not contain further reply_to_message fields even if it itself is a reply.
  new_chat_members?: TelegramUserDto[]; // New members that were added to the group or supergroup and information about them (the bot itself may be one of these members)
  left_chat_member?: TelegramUserDto; // A member was removed from the group, information about them (this member may be the bot itself)
}
