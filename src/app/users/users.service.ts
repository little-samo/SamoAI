import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserState } from '@models/entities/users/states/user.state';
import { UsersRepository } from '@core/repositories/users.repository';
import { UserModel, LlmApiKeyModel, UserPlatform } from '@prisma/client';
import { PrismaService } from '@app/global/prisma.service';
import { RedisService } from '@app/global/redis.service';
import { JsonObject } from '@prisma/client/runtime/library';

@Injectable()
export class UsersService implements UsersRepository {
  private readonly CACHE_TTL = 300; // 5 minutes in seconds
  private readonly USER_STATE_PREFIX = 'cache:user_state:';

  protected readonly logger = new Logger(this.constructor.name);

  public constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    @InjectModel(UserState.name)
    private userStateModel: Model<UserState>
  ) {}

  public async getUserLlmApiKeys(userId: number): Promise<LlmApiKeyModel[]> {
    return this.prisma.llmApiKeyModel.findMany({
      where: { userModelId: userId },
    });
  }

  public async getUserModel(userId: number): Promise<UserModel> {
    const user = await this.prisma.userModel.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return user;
  }

  public async getUserModelByApiKey(apiKey: string): Promise<UserModel> {
    const userApiKey = await this.prisma.userApiKeyModel.findUnique({
      where: { key: apiKey },
      include: { userModel: true },
    });

    if (!userApiKey || !userApiKey.userModel) {
      throw new NotFoundException(`User with API key not found`);
    }

    return userApiKey.userModel;
  }

  public async getUserModelByTelegramId(
    telegramUserId: bigint
  ): Promise<UserModel | null> {
    return await this.prisma.userModel.findUnique({
      where: {
        platform_pid: { platform: UserPlatform.TELEGRAM, pid: telegramUserId },
      },
    });
  }

  public async getOrCreateTelegramUserModel(
    telegramUserId: number,
    firstName: string,
    lastName?: string,
    username?: string
  ): Promise<UserModel> {
    const nickname = lastName ? `${firstName} ${lastName}` : firstName;
    return await this.prisma.userModel.upsert({
      where: {
        platform_pid: { platform: UserPlatform.TELEGRAM, pid: telegramUserId },
      },
      update: { firstName, lastName, username, nickname },
      create: {
        platform: UserPlatform.TELEGRAM,
        pid: telegramUserId,
        firstName,
        lastName,
        username,
        nickname,
      },
    });
  }

  public async getUserModels(
    userIds: number[]
  ): Promise<Record<number, UserModel>> {
    const users = await this.prisma.userModel.findMany({
      where: { id: { in: userIds } },
    });

    return users.reduce(
      (acc, user) => {
        acc[user.id] = user;
        return acc;
      },
      {} as Record<number, UserModel>
    );
  }

  public async getUserState(userId: number): Promise<null | UserState> {
    const cacheKey = `${this.USER_STATE_PREFIX}${userId}`;
    const cachedState = await this.redis.get(cacheKey);

    if (cachedState) {
      return JSON.parse(cachedState);
    }

    const state = await this.userStateModel.findOne({ userId }).exec();

    if (state) {
      await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
    }

    return state;
  }

  public async getUserStates(
    userIds: number[]
  ): Promise<Record<number, UserState>> {
    if (userIds.length === 0) {
      return {};
    }

    const states: Record<number, UserState> = {};

    const cacheKeys = userIds.map((id) => `${this.USER_STATE_PREFIX}${id}`);
    const cachedStates = await this.redis.mget(cacheKeys);

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const cachedState = cachedStates[i];

      if (cachedState) {
        states[userId] = JSON.parse(cachedState);
      }
    }

    const remainingUserIds = userIds.filter((id) => !states[id]);

    if (remainingUserIds.length > 0) {
      const statesFromDb = await this.userStateModel
        .find({ userId: { $in: remainingUserIds } })
        .exec();

      for (const state of statesFromDb) {
        states[state.userId] = state;
      }
    }

    if (Object.keys(states).length > 0) {
      const cacheEntries = Object.values(states).reduce(
        (acc, state) => {
          const cacheKey = `${this.USER_STATE_PREFIX}${state.userId}`;
          acc[cacheKey] = JSON.stringify(state);
          return acc;
        },
        {} as Record<string, string>
      );

      await this.redis.mset(cacheEntries);

      await Promise.all(
        Object.keys(cacheEntries).map((key) =>
          this.redis.expire(key, this.CACHE_TTL)
        )
      );
    }

    return states;
  }

  public async saveUserModel(model: UserModel): Promise<UserModel> {
    if (!model.id) {
      return await this.prisma.userModel.create({
        data: {
          ...model,
          meta: model.meta as JsonObject,
        },
      });
    }
    return await this.prisma.userModel.update({
      where: { id: model.id },
      data: {
        ...model,
        meta: model.meta as JsonObject,
      },
    });
  }

  public async saveUserState(state: UserState): Promise<void> {
    await this.userStateModel.updateOne(
      { userId: state.userId },
      { $set: state },
      { upsert: true }
    );

    const cacheKey = `${this.USER_STATE_PREFIX}${state.userId}`;
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
  }

  public async setUserTelegramCommand(
    userId: number,
    command: string | null
  ): Promise<void> {
    await this.prisma.userModel.update({
      where: { id: userId },
      data: { telegramCommand: command },
    });
  }
}
