export interface TelegramChatDto {
  id: number; // Unique identifier for this chat. This number may have more than 32 significant bits and some programming languages may have difficulty/silent defects in interpreting it. But it has at most 52 significant bits, so a signed 64-bit integer or double-precision float type are safe for storing this identifier.
  type: 'private' | 'group' | 'supergroup' | 'channel'; // Type of the chat, can be either “private”, “group”, “supergroup” or “channel”
  title?: string; // Title, for supergroups, channels and group chats
  username?: string; // Username, for private chats, supergroups and channels if available
  first_name?: string; // First name of the other party in a private chat
  last_name?: string; // Last name of the other party in a private chat
  is_forum?: true; // True, if the supergroup chat is a forum (has topics enabled)
}
