import { sleep } from '../../common/utils/sleep';

import { Lock, LockService } from './lock.service';

export interface LockSettings {
  retryCount: number;
  retryDelay: number;
}

class InMemoryLock implements Lock {
  public constructor(
    private readonly lockService: InMemoryLockService,
    private readonly keys: string[]
  ) {}

  public async release(): Promise<void> {
    this.lockService.releaseLocks(this.keys);
  }
}

interface LockInfo {
  timeout: NodeJS.Timeout;
  resolvePromise: () => void;
}

export class InMemoryLockService implements LockService {
  public static readonly DEFAULT_RETRY_COUNT = 60;
  public static readonly DEFAULT_RETRY_DELAY = 1000; // 1 second

  private readonly locks = new Map<string, LockInfo>();
  private readonly lockPromises = new Map<string, Promise<void>>();
  private readonly settings: LockSettings;

  public constructor(settings: Partial<LockSettings> = {}) {
    this.settings = {
      retryCount:
        settings.retryCount ?? InMemoryLockService.DEFAULT_RETRY_COUNT,
      retryDelay:
        settings.retryDelay ?? InMemoryLockService.DEFAULT_RETRY_DELAY,
    };
  }

  public async acquireLock(key: string, ttl: number): Promise<Lock | null> {
    return this.acquireLockWithRetry(key, ttl, true);
  }

  public async multiLock(keys: string[], ttl: number): Promise<Lock | null> {
    // Sort keys to prevent deadlock
    const sortedKeys = [...keys].sort();
    return this.acquireMultiLockWithRetry(sortedKeys, ttl, true);
  }

  public async acquireLockNoRetry(
    key: string,
    ttl: number
  ): Promise<Lock | null> {
    return this.acquireLockWithRetry(key, ttl, false);
  }

  public async multiLockNoRetry(
    keys: string[],
    ttl: number
  ): Promise<Lock | null> {
    // Sort keys to prevent deadlock
    const sortedKeys = [...keys].sort();
    return this.acquireMultiLockWithRetry(sortedKeys, ttl, false);
  }

  private async acquireLockWithRetry(
    key: string,
    ttl: number,
    retry: boolean
  ): Promise<Lock | null> {
    const maxRetries = retry ? this.settings.retryCount : 1;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (this.tryAcquireSingleLock(key, ttl)) {
        return new InMemoryLock(this, [key]);
      }

      if (!retry) {
        return null;
      }

      // Wait for the existing lock to be released or retry after delay
      const existingPromise = this.lockPromises.get(key);
      if (existingPromise) {
        try {
          await Promise.race([
            existingPromise,
            sleep(this.settings.retryDelay),
          ]);
        } catch {
          // Ignore errors from the existing promise
        }
      } else {
        await sleep(this.settings.retryDelay);
      }
    }

    return null;
  }

  private async acquireMultiLockWithRetry(
    keys: string[],
    ttl: number,
    retry: boolean
  ): Promise<Lock | null> {
    const maxRetries = retry ? this.settings.retryCount : 1;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const acquiredKeys = this.tryAcquireMultipleLocks(keys, ttl);
      if (acquiredKeys.length === keys.length) {
        return new InMemoryLock(this, keys);
      }

      // Rollback any partially acquired locks
      if (acquiredKeys.length > 0) {
        this.releaseLocks(acquiredKeys);
      }

      if (!retry) {
        return null;
      }

      // Wait for any of the existing locks to be released or retry after delay
      const existingPromises = keys
        .map((key) => this.lockPromises.get(key))
        .filter((promise) => promise !== undefined) as Promise<void>[];

      if (existingPromises.length > 0) {
        try {
          await Promise.race([
            Promise.all(existingPromises),
            sleep(this.settings.retryDelay),
          ]);
        } catch {
          // Ignore errors from existing promises
        }
      } else {
        await sleep(this.settings.retryDelay);
      }
    }

    return null;
  }

  private tryAcquireSingleLock(key: string, ttl: number): boolean {
    if (this.locks.has(key)) {
      return false;
    }

    return this.acquireLockInternal(key, ttl);
  }

  private tryAcquireMultipleLocks(keys: string[], ttl: number): string[] {
    const acquiredKeys: string[] = [];

    // Check if any of the keys are already locked
    for (const key of keys) {
      if (this.locks.has(key)) {
        // Rollback any locks we've acquired so far
        this.releaseLocks(acquiredKeys);
        return [];
      }
    }

    // Acquire all locks atomically
    for (const key of keys) {
      if (this.acquireLockInternal(key, ttl)) {
        acquiredKeys.push(key);
      } else {
        // This should not happen since we checked above, but safety rollback
        this.releaseLocks(acquiredKeys);
        return [];
      }
    }

    return acquiredKeys;
  }

  private acquireLockInternal(key: string, ttl: number): boolean {
    if (this.locks.has(key)) {
      return false;
    }

    let resolvePromise: () => void;
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const timeout = setTimeout(() => {
      this.releaseLocks([key]);
    }, ttl);

    const lockInfo: LockInfo = {
      timeout,
      resolvePromise: resolvePromise!,
    };

    this.locks.set(key, lockInfo);
    this.lockPromises.set(key, promise);

    return true;
  }

  public releaseLocks(keys: string[]): void {
    for (const key of keys) {
      const lockInfo = this.locks.get(key);
      if (lockInfo) {
        clearTimeout(lockInfo.timeout);
        this.locks.delete(key);

        // Resolve the promise to notify waiting acquirers
        try {
          lockInfo.resolvePromise();
        } catch (error) {
          // Log error but continue cleanup
          console.warn(`Error resolving lock promise for key ${key}:`, error);
        }

        // Always remove the promise to prevent memory leaks
        this.lockPromises.delete(key);
      }
    }
  }

  // Utility method to get current lock status (for debugging)
  public getLockStatus(): { lockedKeys: string[]; pendingPromises: number } {
    return {
      lockedKeys: Array.from(this.locks.keys()),
      pendingPromises: this.lockPromises.size,
    };
  }

  // Cleanup method to force release all locks (for emergency situations)
  public releaseAllLocks(): void {
    const allKeys = Array.from(this.locks.keys());
    this.releaseLocks(allKeys);
  }
}
