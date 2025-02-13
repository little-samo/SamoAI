import { AgentsRepository } from '@core/repositories/agents.repository';
import { LocationsRepository } from '@core/repositories/locations.repository';
import { UsersRepository } from '@core/repositories/users.repository';
import { RedisLockService } from '@core/services/redis-lock.service';
import { Agent } from '@models/entities/agents/agent';
import { User } from '@models/entities/users/user';
import { Location } from '@models/locations/location';
import {
  DEFAULT_LOCATION_META,
  LocationMeta,
} from '@models/locations/location.meta';
import {
  LocationMessage,
  LocationMessagesState,
} from '@models/locations/states/location.messages-state';
import { LocationState } from '@models/locations/states/location.state';

interface UpdateLocationOptions {
  preAction?: (location: Location) => Promise<void>;
  postAction?: (location: Location) => Promise<void>;
}

export class WorldManager {
  private static readonly LOCK_TTL = 30000; // 30 seconds
  private static readonly LOCATION_LOCK_PREFIX = 'lock:location:';
  private static readonly AGENT_LOCK_PREFIX = 'lock:agent:';
  private static readonly USER_LOCK_PREFIX = 'lock:user:';

  private static _instance: WorldManager;

  public static initialize(
    redisLockService: RedisLockService,
    locationRepository: LocationsRepository,
    agentRepository: AgentsRepository,
    userRepository: UsersRepository
  ) {
    WorldManager._instance = new WorldManager(
      redisLockService,
      locationRepository,
      agentRepository,
      userRepository
    );
  }

  public static get instance() {
    if (!this._instance) {
      throw new Error('WorldManager not initialized');
    }
    return this._instance;
  }

  private constructor(
    private readonly redisLockService: RedisLockService,
    private readonly locationRepository: LocationsRepository,
    private readonly agentRepository: AgentsRepository,
    private readonly userRepository: UsersRepository
  ) {}

  private async withLocationLock<T>(
    locationId: number,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${WorldManager.LOCATION_LOCK_PREFIX}${locationId}`;
    const lock = await this.redisLockService.acquireLock(
      lockKey,
      WorldManager.LOCK_TTL
    );
    if (!lock) {
      throw new Error(`Failed to lock location ${locationId}`);
    }
    try {
      return await operation();
    } finally {
      await lock.release();
    }
  }

  private async withLocationAndEntitiesLock<T>(
    llmApiKeyUserId: number,
    locationId: number,
    operation: (location: Location) => Promise<T>
  ): Promise<T> {
    return await this.withLocationLock(locationId, async () => {
      const location = await this.getLocation(llmApiKeyUserId, locationId);

      const lockKeys: string[] = [];
      for (const agentId of location.state.agentIds) {
        lockKeys.push(`${WorldManager.AGENT_LOCK_PREFIX}${agentId}`);
      }
      for (const userId of location.state.userIds) {
        lockKeys.push(`${WorldManager.USER_LOCK_PREFIX}${userId}`);
      }

      const lock = await this.redisLockService.multiLock(
        lockKeys,
        WorldManager.LOCK_TTL
      );
      if (!lock) {
        throw new Error(`Failed to lock location ${locationId}`);
      }
      try {
        return await operation(location);
      } finally {
        await lock.release();
      }
    });
  }

  private async getLocation(
    llmApiKeyUserId: number,
    locationId: number,
    defaultMeta?: LocationMeta
  ): Promise<Location> {
    const apiKeys =
      await this.userRepository.getUserLlmApiKeys(llmApiKeyUserId);

    const locationModel =
      await this.locationRepository.getLocationModel(locationId);
    const locationState =
      await this.locationRepository.getLocationState(locationId);
    const locationMessagesState =
      await this.locationRepository.getLocationMessagesState(locationId);

    const location = new Location(locationModel, {
      state: locationState,
      messagesState: locationMessagesState,
      apiKeys,
      defaultMeta,
    });

    const agents = await this.getAgents(
      location,
      location.state.agentIds,
      location.state.userIds
    );
    const users = await this.getUsers(location, location.state.userIds);

    for (const agent of Object.values(agents)) {
      location.addEntity(agent, false);
    }
    for (const user of Object.values(users)) {
      location.addEntity(user, false);
    }

    return location;
  }

  private async getOrCreateLocationState(
    locationId: number
  ): Promise<LocationState> {
    let locationState =
      await this.locationRepository.getLocationState(locationId);
    if (!locationState) {
      const locationModel =
        await this.locationRepository.getLocationModel(locationId);
      const locationMeta = {
        ...DEFAULT_LOCATION_META,
        ...(locationModel.meta as object),
      };
      locationState = Location.createState(locationModel, locationMeta);
    }
    return locationState;
  }

  private async getOrCreateLocationMessagesState(
    locationId: number
  ): Promise<LocationMessagesState> {
    let locationMessagesState =
      await this.locationRepository.getLocationMessagesState(locationId);
    if (!locationMessagesState) {
      const locationModel =
        await this.locationRepository.getLocationModel(locationId);
      const locationMeta = {
        ...DEFAULT_LOCATION_META,
        ...(locationModel.meta as object),
      };
      locationMessagesState = Location.createMessagesState(
        locationModel,
        locationMeta
      );
    }
    return locationMessagesState;
  }

  private async getAgents(
    location: Location,
    agentIds: number[],
    userIds: number[]
  ): Promise<Record<number, Agent>> {
    const agentModels = await this.agentRepository.getAgentModels(agentIds);
    agentIds = agentIds.filter((agentId) => agentModels[agentId]?.isActive);

    const agentStates = await this.agentRepository.getAgentStates(agentIds);
    const agentEntityStates = await this.agentRepository.getAgentEntityStates(
      agentIds,
      agentIds,
      userIds
    );

    const agents: Record<number, Agent> = {};
    for (const agentId of agentIds) {
      const agent = new Agent(
        location,
        agentModels[agentId],
        agentStates[agentId]
      );

      const entityStates = agentEntityStates[agentId];
      if (entityStates) {
        for (const entityState of entityStates) {
          agent.addEntityState(entityState);
        }
      }

      for (const otherAgentId of agentIds) {
        if (otherAgentId === agentId) {
          continue;
        }
        agent.getOrCreateEntityStateByTarget(otherAgentId);
      }
      for (const otherUserId of userIds) {
        agent.getOrCreateEntityStateByTarget(undefined, otherUserId);
      }

      agents[agentId] = agent;
    }

    return agents;
  }

  private async getUsers(
    location: Location,
    userIds: number[]
  ): Promise<Record<number, User>> {
    const userModels = await this.userRepository.getUserModels(userIds);
    const userStates = await this.userRepository.getUserStates(userIds);

    const users: Record<number, User> = {};
    for (const userId of userIds) {
      users[userId] = new User(
        location,
        userModels[userId],
        userStates[userId]
      );
    }

    return users;
  }

  private async saveLocation(location: Location): Promise<void> {
    await this.locationRepository.saveLocationModel(location.model);
    await this.locationRepository.saveLocationState(location.state);
    await this.locationRepository.saveLocationMessagesState(
      location.messagesState
    );

    await this.saveAgents(Object.values(location.agents));
    await this.saveUsers(Object.values(location.users));
  }

  private async saveAgents(agents: Agent[]): Promise<void> {
    await this.agentRepository.saveAgentStates(
      agents.map((agent) => agent.state)
    );
    await this.agentRepository.saveAgentEntityStates(
      agents.flatMap((agent) => agent.getEntityStates())
    );
  }

  private async saveUsers(users: User[]): Promise<void> {
    await this.userRepository.saveUserStates(users.map((user) => user.state));
  }

  public async addLocationAgent(
    locationId: number,
    agentId: number
  ): Promise<void> {
    await this.withLocationLock(locationId, async () => {
      const locationState = await this.getOrCreateLocationState(locationId);
      if (locationState.agentIds.includes(agentId)) {
        return;
      }

      locationState.agentIds.push(agentId);
      locationState.dirty = true;

      await this.locationRepository.saveLocationState(locationState);
    });
  }

  public async addLocationUser(
    locationId: number,
    userId: number
  ): Promise<void> {
    await this.withLocationLock(locationId, async () => {
      const locationState = await this.getOrCreateLocationState(locationId);
      if (locationState.userIds.includes(userId)) {
        return;
      }

      locationState.userIds.push(userId);
      locationState.dirty = true;

      await this.locationRepository.saveLocationState(locationState);
    });
  }

  public async addLocationMessage(
    locationId: number,
    message: LocationMessage
  ): Promise<void> {
    await this.withLocationLock(locationId, async () => {
      const locationMessagesState =
        await this.getOrCreateLocationMessagesState(locationId);

      if (!message.createdAt) {
        message.createdAt = new Date();
      }
      message.updatedAt = new Date();
      locationMessagesState.messages.push(message);
      locationMessagesState.messages.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      locationMessagesState.dirty = true;

      await this.locationRepository.saveLocationMessagesState(
        locationMessagesState
      );
    });
  }

  public async updateLocation(
    llmApiKeyUserId: number,
    locationId: number,
    options: UpdateLocationOptions = {}
  ): Promise<Location> {
    return await this.withLocationAndEntitiesLock(
      llmApiKeyUserId,
      locationId,
      async (location) => {
        if (options.preAction) {
          await options.preAction(location);
        }

        await location.update();

        if (options.postAction) {
          await options.postAction(location);
        }

        await this.saveLocation(location);
        return location;
      }
    );
  }
}
