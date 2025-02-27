export interface RedisLock {
  release(): Promise<void>;
}

export interface RedisLockService {
  acquireLock(key: string, ttl: number): Promise<RedisLock | null>;
  multiLock(keys: string[], ttl: number): Promise<RedisLock | null>;
  acquireLockNoRetry(key: string, ttl: number): Promise<RedisLock | null>;
  multiLockNoRetry(keys: string[], ttl: number): Promise<RedisLock | null>;
}
