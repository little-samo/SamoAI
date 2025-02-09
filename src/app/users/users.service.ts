import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserState } from '@models/entities/users/states/user.state';
import { UsersRepository } from '@core/users/users.repository';
import { UserModel, UserApiKeyModel } from '@prisma/client';
import { PrismaService } from '@app/prisma/prisma.service';
import { RedisService } from '@app/redis/redis.service';
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

  public async getUserLlmApiKeys(userId: number): Promise<UserApiKeyModel[]> {
    return this.prisma.userApiKeyModel.findMany({
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

  public async saveUserModel(model: UserModel): Promise<void> {
    await this.prisma.userModel.upsert({
      where: { id: model.id },
      update: {
        ...model,
        meta: model.meta as JsonObject,
      },
      create: {
        ...model,
        meta: model.meta as JsonObject,
      },
    });
  }

  public async saveUserState(state: UserState): Promise<void> {
    await this.userStateModel.updateOne(
      { userId: state.userId },
      { $set: { ...state } },
      { upsert: true }
    );

    const cacheKey = `${this.USER_STATE_PREFIX}${state.userId}`;
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
  }
}
