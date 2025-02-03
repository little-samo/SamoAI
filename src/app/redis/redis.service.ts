import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import Redlock, { Lock } from 'redlock';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis;
  private readonly redlock: Redlock;

  public constructor() {
    this.redis = new Redis(process.env.REDIS_URL!);
    this.redlock = new Redlock([this.redis], {
      // Configuration for the Redlock instance
      driftFactor: 0.01, // Time in ms to account for drift
      retryCount: 10, // Maximum number of retries
      retryDelay: 200, // Time in ms between retries
      retryJitter: 200, // Variance in retry delay
      automaticExtensionThreshold: 500, // Time in ms for automatic lock extension
    });
  }

  /**
   * Initializes the Redis connection
   * Checks connection by sending a ping command
   */
  public async onModuleInit() {
    await this.redis.ping();
  }

  /**
   * Gracefully closes the Redis connection when the module is destroyed
   */
  public async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Sets a key-value pair in Redis
   * @param key - The key to set
   * @param value - The value to set
   * @param ttl - Optional time to live in seconds
   * @returns 'OK' if successful
   */
  public async set(key: string, value: string, ttl?: number): Promise<'OK'> {
    if (ttl) {
      return this.redis.set(key, value, 'EX', ttl);
    }
    return this.redis.set(key, value);
  }

  /**
   * Gets the value for a given key
   * @param key - The key to get
   * @returns The value if exists, null otherwise
   */
  public async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  /**
   * Deletes a key from Redis
   * @param key - The key to delete
   * @returns Number of keys deleted
   */
  public async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  /**
   * Sets a field in a hash stored at key
   * @param key - The key of the hash
   * @param field - The field to set
   * @param value - The value to set
   * @returns 1 if field is new, 0 if field was updated
   */
  public async hset(
    key: string,
    field: string,
    value: string
  ): Promise<number> {
    return this.redis.hset(key, field, value);
  }

  /**
   * Gets the value of a field in a hash
   * @param key - The key of the hash
   * @param field - The field to get
   * @returns The value if exists, null otherwise
   */
  public async hget(key: string, field: string): Promise<string | null> {
    return this.redis.hget(key, field);
  }

  /**
   * Deletes a field from a hash
   * @param key - The key of the hash
   * @param field - The field to delete
   * @returns Number of fields removed
   */
  public async hdel(key: string, field: string): Promise<number> {
    return this.redis.hdel(key, field);
  }

  /**
   * Pushes a value to the head of a list
   * @param key - The key of the list
   * @param value - The value to push
   * @returns Length of the list after push
   */
  public async lpush(key: string, value: string): Promise<number> {
    return this.redis.lpush(key, value);
  }

  /**
   * Pushes a value to the tail of a list
   * @param key - The key of the list
   * @param value - The value to push
   * @returns Length of the list after push
   */
  public async rpush(key: string, value: string): Promise<number> {
    return this.redis.rpush(key, value);
  }

  /**
   * Removes and returns the first element of a list
   * @param key - The key of the list
   * @returns The popped value if exists, null otherwise
   */
  public async lpop(key: string): Promise<string | null> {
    return this.redis.lpop(key);
  }

  /**
   * Removes and returns the last element of a list
   * @param key - The key of the list
   * @returns The popped value if exists, null otherwise
   */
  public async rpop(key: string): Promise<string | null> {
    return this.redis.rpop(key);
  }

  /**
   * Checks if a key exists in Redis
   * @param key - The key to check
   * @returns 1 if exists, 0 otherwise
   */
  public async exists(key: string): Promise<number> {
    return this.redis.exists(key);
  }

  /**
   * Sets a timeout on a key
   * @param key - The key to expire
   * @param seconds - Time to live in seconds
   * @returns 1 if timeout was set, 0 if key doesn't exist
   */
  public async expire(key: string, seconds: number): Promise<number> {
    return this.redis.expire(key, seconds);
  }

  /**
   * Returns the Redis client instance
   * Use with caution as it exposes the raw client
   * @returns Redis client instance
   */
  public getClient(): Redis {
    return this.redis;
  }

  /**
   * Acquires a lock on a single resource
   * @param resource - The resource to lock
   * @param ttl - Time to live in milliseconds
   * @returns Lock object if successful, null otherwise
   */
  public async acquireLock(
    resource: string,
    ttl: number = 30000
  ): Promise<Lock | null> {
    try {
      const lock = await this.redlock.acquire([resource], ttl);
      return lock;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  /**
   * Acquires locks on multiple resources
   * Resources are sorted to prevent deadlocks
   * @param resources - Array of resources to lock
   * @param ttl - Time to live in milliseconds
   * @returns Lock object if successful, null otherwise
   */
  public async multiLock(
    resources: string[],
    ttl: number = 30000
  ): Promise<Lock | null> {
    try {
      // Sort resources to maintain consistent locking order
      // This helps prevent deadlocks when multiple processes try to lock the same resources
      const sortedResources = [...resources].sort();
      const lock = await this.redlock.acquire(sortedResources, ttl);
      return lock;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
}
