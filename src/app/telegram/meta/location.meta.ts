import {
  DEFAULT_LOCATION_META,
  LocationMeta,
} from '@models/locations/location.meta';

export const TELEGRAM_BOT_PRIVATE_LOCATION_META: LocationMeta = {
  ...DEFAULT_LOCATION_META,
  ...{
    description:
      'This is a private chat on Telegram. Here, the Agent and the User are having a one-on-one conversation, and the Agent must respond to every message from the User.',

    messageLimit: 30,
    messageLengthLimit: 400,
    rules: ['You must generate at least one Message with every response.'],
  },
};
