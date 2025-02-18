import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LocationState } from '@models/locations/states/location.state';
import { LocationMessagesState } from '@models/locations/states/location.messages-state';
import { LocationsRepository } from '@core/repositories/locations.repository';
import { LocationModel, UserPlatform } from '@prisma/client';
import { PrismaService } from '@app/global/prisma.service';
import { RedisService } from '@app/global/redis.service';
import { JsonObject } from '@prisma/client/runtime/library';
import { Cron } from '@nestjs/schedule';
import { WorldManager } from '@core/managers/world.manager';
import { ShutdownService } from '@app/global/shutdown.service';
import { Location } from '@models/locations/location';
import { ENV } from '@common/config';

@Injectable()
export class LocationsService implements LocationsRepository {
  private readonly CACHE_TTL = 300; // 5 minutes in seconds
  private readonly LOCATION_STATE_PREFIX = 'cache:location_state:';
  private readonly LOCATION_MESSAGES_STATE_PREFIX =
    'cache:location_messages_state:';
  private readonly UPDATE_LOCK_KEY = 'locations:update';
  private readonly UPDATE_LOCK_TTL = 30000; // 30 seconds

  protected readonly logger = new Logger(this.constructor.name);

  private readonly locationUpdatePreActions: Record<
    UserPlatform,
    (location: Location) => Promise<void>
  > = {
    API: async () => {},
    TELEGRAM: async () => {},
  };

  public constructor(
    private shutdownService: ShutdownService,
    private prisma: PrismaService,
    private redis: RedisService,
    @InjectModel(LocationState.name)
    private locationStateModel: Model<LocationState>,
    @InjectModel(LocationMessagesState.name)
    private locationMessagesStateModel: Model<LocationMessagesState>
  ) {}

  public registerLocationUpdatePreAction(
    platform: UserPlatform,
    preAction: (location: Location) => Promise<void>
  ): void {
    this.locationUpdatePreActions[platform] = preAction;
  }

  private async handleLocationSave(save: Promise<void>): Promise<void> {
    this.shutdownService.incrementActiveRequests();
    try {
      await save;
    } finally {
      this.shutdownService.decrementActiveRequests();
    }
  }

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
    locationModel: LocationModel
  ): Promise<LocationModel> {
    try {
      return await this.getLocationModelByName(locationModel.name);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return this.saveLocationModel(locationModel);
      }
      throw error;
    }
  }

  public async getAllUnpausedLocationIds(): Promise<number[]> {
    const locations = await this.locationStateModel.find(
      {
        pauseUpdateUntil: {
          $lte: new Date(),
        },
      },
      { locationId: 1, _id: 0 }
    );

    return locations.map((location) => location.locationId);
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
    if (!state.dirty) {
      return;
    }
    state.dirty = false;

    await this.locationStateModel.updateOne(
      { locationId: state.locationId },
      { $set: state },
      { upsert: true }
    );

    const cacheKey = `${this.LOCATION_STATE_PREFIX}${state.locationId}`;
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
  }

  public async saveLocationMessagesState(
    state: LocationMessagesState
  ): Promise<void> {
    if (!state.dirty) {
      return;
    }
    state.dirty = false;

    await this.locationMessagesStateModel.updateOne(
      { locationId: state.locationId },
      { $set: state },
      { upsert: true }
    );

    const cacheKey = `${this.LOCATION_MESSAGES_STATE_PREFIX}${state.locationId}`;
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
  }

  public async updateLocationNoRetry(
    llmApiKeyUserId: number,
    locationId: number
  ): Promise<void> {
    this.shutdownService.incrementActiveRequests();
    try {
      await WorldManager.instance.updateLocationNoRetry(
        llmApiKeyUserId,
        locationId,
        {
          preAction: async (location) => {
            await this.locationUpdatePreActions[location.model.platform]!(
              location
            );
          },
          handleSave: async (save) => {
            await this.handleLocationSave(save);
          },
        }
      );
    } catch (error) {
      this.logger.error(`Error updating location ${locationId}: ${error}`);
    } finally {
      this.shutdownService.decrementActiveRequests();
    }
  }

  @Cron(`*/3 * * * * *`) // every 3 seconds
  private async updateUnpausedLocations(): Promise<void> {
    if (this.shutdownService.isShuttingDown) {
      return;
    }

    const lock = await this.redis.acquireLockNoRetry(
      this.UPDATE_LOCK_KEY,
      this.UPDATE_LOCK_TTL
    );
    if (!lock) {
      if (ENV.DEBUG) {
        this.logger.log('Lock not acquired, skipping update');
      }
      return;
    }
    this.shutdownService.incrementActiveRequests();
    try {
      const llmApiKeyUserId = Number(process.env.TELEGRAM_LLM_API_USER_ID);
      const locationIds = await this.getAllUnpausedLocationIds();
      for (const locationId of locationIds) {
        void this.updateLocationNoRetry(llmApiKeyUserId, locationId);
      }
    } finally {
      await lock.release();
      this.shutdownService.decrementActiveRequests();
    }
  }
}
