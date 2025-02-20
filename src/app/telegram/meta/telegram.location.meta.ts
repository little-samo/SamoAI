import {
  DEFAULT_LOCATION_META,
  LocationMeta,
} from '@little-samo/samo-ai/models/locations/location.meta';

export const TELEGRAM_MESSAGE_LENGTH_LIMIT = 500;

export const TELEGRAM_BOT_PRIVATE_LOCATION_META: LocationMeta = {
  ...DEFAULT_LOCATION_META,
  ...{
    description:
      'This is a private chat on Telegram. Here, the Agent and the User are having a one-on-one conversation, and the Agent must respond to every message from the User.',

    messageLengthLimit: TELEGRAM_MESSAGE_LENGTH_LIMIT,
    requiredActions: ['send_casual_message'],
    rules: ['You must generate at least one Message with every response.'],
  },
};

export const TELEGRAM_BOT_GROUP_LOCATION_META: LocationMeta = {
  ...DEFAULT_LOCATION_META,
  ...{
    core: 'round_robin',
    description:
      'This is a group chat on Telegram. Multiple Agents and Users are conversing here.',

    messageLengthLimit: TELEGRAM_MESSAGE_LENGTH_LIMIT,
    rules: [
      `You don't have to participate in every conversation. Only respond when you feel it's necessary or when someone specifically needs your answer.`,
      `You must not annoy others with too many messages. Consider performing other actions without sending a message.`,
      `You don't have to send a message every time—judge the necessity carefully.`,
    ],
  },
};
