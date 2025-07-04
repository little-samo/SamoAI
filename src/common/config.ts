const env = process?.env ?? {};

export const ENV = {
  ...env,
  DEBUG: env.DEBUG?.toLowerCase() === 'true',
  VERBOSE_LLM: env.VERBOSE_LLM?.toLowerCase() === 'true',
};
