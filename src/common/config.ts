const env = typeof process !== 'undefined' && process.env ? process.env : {};

export const ENV = {
  ...env,
  DEBUG: env.DEBUG?.toLowerCase() === 'true',
  VERBOSE_LLM: env.VERBOSE_LLM?.toLowerCase() === 'true',

  IMAGE_MEMORY_CACHE_DISABLED:
    env.IMAGE_MEMORY_CACHE_DISABLED?.toLowerCase() === 'true',
  IMAGE_MEMORY_CACHE_SIZE_MB: env.IMAGE_MEMORY_CACHE_SIZE_MB
    ? parseInt(env.IMAGE_MEMORY_CACHE_SIZE_MB)
    : 256,
};
