export interface TelegramReplyKeyboardMarkupDto {
  keyboard: TelegramKeyboardButtonDto[][];
  input_field_placeholder?: string; // The placeholder to be shown in the input field when the keyboard is active; 1-64 characters
}

export interface TelegramKeyboardButtonDto {
  text: string; // Text of the button. If none of the optional fields are used, it will be sent as a message when the button is pressed
}

export interface TelegramReplyKeyboardRemoveDto {
  remove_keyboard: true; // Requests clients to remove the custom keyboard (user will not be able to summon this keyboard; if you want to hide the keyboard from sight but keep it accessible, use one_time_keyboard in ReplyKeyboardMarkup)
}
