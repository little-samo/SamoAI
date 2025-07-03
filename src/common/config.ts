export const ENV = {
  ...process.env,
  DEBUG: process.env.DEBUG?.toLowerCase() === 'true',
  VERBOSE_LLM: process.env.VERBOSE_LLM?.toLowerCase() === 'true',
};
