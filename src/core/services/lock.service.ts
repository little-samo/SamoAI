export interface Lock {
  release(): Promise<unknown>;
}

export interface LockService {
  acquireLock(key: string, ttl: number): Promise<Lock | null>;
  multiLock(keys: string[], ttl: number): Promise<Lock | null>;
  acquireLockNoRetry(key: string, ttl: number): Promise<Lock | null>;
  multiLockNoRetry(keys: string[], ttl: number): Promise<Lock | null>;
}
