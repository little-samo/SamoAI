export interface TelegramInlineKeyboardMarkupDto {
  inline_keyboard: TelegramInlineKeyboardButtonDto[][];
}

export interface TelegramInlineKeyboardButtonDto {
  text: string; // Label text on the button
  url?: string; // HTTP or tg:// URL to be opened when the button is pressed. Links tg://user?id=<user_id> can be used to mention a user by their identifier without using a username, if this is allowed by their privacy settings.
  callback_data?: string; // Data to be sent in a callback query to the bot when the button is pressed, 1-64 bytes
  pay?: boolean; // Specify True, to send a Pay button. Substrings “⭐” and “XTR” in the buttons's text will be replaced with a Telegram Star icon. NOTE: This type of button must always be the first button in the first row and can only be used in invoice messages.
}
