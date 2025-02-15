import { Lock } from 'redlock';

export interface RedisLockService {
  acquireLock(key: string, ttl: number): Promise<Lock | null>;
  multiLock(keys: string[], ttl: number): Promise<Lock | null>;
  acquireLockNoRetry(key: string, ttl: number): Promise<Lock | null>;
  multiLockNoRetry(keys: string[], ttl: number): Promise<Lock | null>;
}
