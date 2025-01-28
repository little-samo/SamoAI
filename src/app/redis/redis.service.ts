import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis;

  public constructor() {
    this.redis = new Redis(process.env.REDIS_URL!);
  }

  public async onModuleInit() {
    await this.redis.ping();
  }

  public async onModuleDestroy() {
    await this.redis.quit();
  }

  public async set(key: string, value: string, ttl?: number): Promise<'OK'> {
    if (ttl) {
      return this.redis.set(key, value, 'EX', ttl);
    }
    return this.redis.set(key, value);
  }

  public async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  public async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  public async hset(
    key: string,
    field: string,
    value: string
  ): Promise<number> {
    return this.redis.hset(key, field, value);
  }

  public async hget(key: string, field: string): Promise<string | null> {
    return this.redis.hget(key, field);
  }

  public async hdel(key: string, field: string): Promise<number> {
    return this.redis.hdel(key, field);
  }

  public async lpush(key: string, value: string): Promise<number> {
    return this.redis.lpush(key, value);
  }

  public async rpush(key: string, value: string): Promise<number> {
    return this.redis.rpush(key, value);
  }

  public async lpop(key: string): Promise<string | null> {
    return this.redis.lpop(key);
  }

  public async rpop(key: string): Promise<string | null> {
    return this.redis.rpop(key);
  }

  public async exists(key: string): Promise<number> {
    return this.redis.exists(key);
  }

  public async expire(key: string, seconds: number): Promise<number> {
    return this.redis.expire(key, seconds);
  }

  public getClient(): Redis {
    return this.redis;
  }
}
