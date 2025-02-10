import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LocationState } from '@models/locations/states/location.state';
import { LocationMessagesState } from '@models/locations/states/location.messages-state';
import { LocationsRepository } from '@core/repositories/locations.repository';
import { LocationModel } from '@prisma/client';
import { PrismaService } from '@app/prisma/prisma.service';
import { RedisService } from '@app/redis/redis.service';
import { JsonObject } from '@prisma/client/runtime/library';

@Injectable()
export class LocationsService implements LocationsRepository {
  private readonly CACHE_TTL = 300; // 5 minutes in seconds
  private readonly LOCATION_STATE_PREFIX = 'cache:location_state:';
  private readonly LOCATION_MESSAGES_STATE_PREFIX =
    'cache:location_messages_state:';

  protected readonly logger = new Logger(this.constructor.name);

  public constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    @InjectModel(LocationState.name)
    private locationStateModel: Model<LocationState>,
    @InjectModel(LocationMessagesState.name)
    private locationMessagesStateModel: Model<LocationMessagesState>
  ) {}

  public async getLocationModel(locationId: number): Promise<LocationModel> {
    const location = await this.prisma.locationModel.findUnique({
      where: { id: locationId },
    });

    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    return location;
  }

  public async getLocationModelByName(name: string): Promise<LocationModel> {
    const location = await this.prisma.locationModel.findUnique({
      where: { name },
    });

    if (!location) {
      throw new NotFoundException(`Location with name ${name} not found`);
    }

    return location;
  }

  public async getOrCreateLocationModelByName(
    name: string
  ): Promise<LocationModel> {
    try {
      return await this.getLocationModelByName(name);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return this.saveLocationModel({
          name,
        } as LocationModel);
      }
      throw error;
    }
  }

  public async getLocationState(
    locationId: number
  ): Promise<null | LocationState> {
    const cacheKey = `${this.LOCATION_STATE_PREFIX}${locationId}`;
    const cachedState = await this.redis.get(cacheKey);

    if (cachedState) {
      return JSON.parse(cachedState);
    }

    const state = await this.locationStateModel.findOne({ locationId }).exec();

    if (state) {
      await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
    }

    return state;
  }

  public async getLocationMessagesState(
    locationId: number
  ): Promise<null | LocationMessagesState> {
    const cacheKey = `${this.LOCATION_MESSAGES_STATE_PREFIX}${locationId}`;
    const cachedState = await this.redis.get(cacheKey);

    if (cachedState) {
      return JSON.parse(cachedState);
    }

    const state = await this.locationMessagesStateModel
      .findOne({ locationId })
      .exec();

    if (state) {
      await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
    }

    return state;
  }

  public async saveLocationModel(model: LocationModel): Promise<LocationModel> {
    if (!model.id) {
      return await this.prisma.locationModel.create({
        data: {
          ...model,
          meta: model.meta as JsonObject,
        },
      });
    }
    return await this.prisma.locationModel.update({
      where: { id: model.id },
      data: {
        ...model,
        meta: model.meta as JsonObject,
      },
    });
  }

  public async saveLocationState(state: LocationState): Promise<void> {
    await this.locationStateModel.updateOne(
      { locationId: state.locationId },
      { $set: { ...state } },
      { upsert: true }
    );

    const cacheKey = `${this.LOCATION_STATE_PREFIX}${state.locationId}`;
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
  }

  public async saveLocationMessagesState(
    state: LocationMessagesState
  ): Promise<void> {
    await this.locationMessagesStateModel.updateOne(
      { locationId: state.locationId },
      { $set: { ...state } },
      { upsert: true }
    );

    const cacheKey = `${this.LOCATION_MESSAGES_STATE_PREFIX}${state.locationId}`;
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
  }
}
