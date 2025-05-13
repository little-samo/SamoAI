import { RedisLock, RedisLockService } from './redis-lock.service';

class NoopRedisLock implements RedisLock {
  public async release(): Promise<void> {
    // No-op implementation as this is a no-operation lock
    return Promise.resolve();
  }
}

export class NoopRedisLockService implements RedisLockService {
  public async acquireLock(
    _key: string,
    _ttl: number
  ): Promise<RedisLock | null> {
    // Always succeed in acquiring the lock in this no-operation implementation
    return new NoopRedisLock();
  }

  public async multiLock(
    _keys: string[],
    _ttl: number
  ): Promise<RedisLock | null> {
    // Always succeed in acquiring multiple locks in this no-operation implementation
    return new NoopRedisLock();
  }

  public async acquireLockNoRetry(
    _key: string,
    _ttl: number
  ): Promise<RedisLock | null> {
    // Always succeed in acquiring the lock in this no-operation implementation
    return new NoopRedisLock();
  }

  public async multiLockNoRetry(
    _keys: string[],
    _ttl: number
  ): Promise<RedisLock | null> {
    // Always succeed in acquiring multiple locks in this no-operation implementation
    return new NoopRedisLock();
  }
}
