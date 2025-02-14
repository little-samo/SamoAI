import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
  ...process.env,
  DEBUG: process.env.DEBUG?.toLowerCase() === 'true',
};
