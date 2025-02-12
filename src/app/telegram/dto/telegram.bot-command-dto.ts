export interface TelegramBotCommandDto {
  command: string; // Text of the command; 1-32 characters. Can contain only lowercase English letters, digits and underscores.
  description: string; // Description of the command; 1-256 characters.
}
