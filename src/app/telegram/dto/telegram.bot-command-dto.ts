export interface TelegramBotCommandDto {
  command: string; // Text of the command; 1-32 characters. Can contain only lowercase English letters, digits and underscores.
  description: string; // Description of the command; 1-256 characters.
}

export interface TelegramBotCommandScopeDto {
  type:
    | 'default'
    | 'all_private_chats'
    | 'all_group_chats'
    | 'all_chat_administrators'
    | 'chat'
    | 'chat_administrators'
    | 'chat_member';
  chat_id?: number;
  user_id?: number;
}
