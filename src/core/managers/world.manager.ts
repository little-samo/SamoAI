import { ENV } from '@common/config';
import { AgentsRepository } from '@core/repositories/agents.repository';
import { LocationsRepository } from '@core/repositories/locations.repository';
import { UsersRepository } from '@core/repositories/users.repository';
import { RedisLockService } from '@core/services/redis-lock.service';
import { Agent } from '@models/entities/agents/agent';
import { AgentEntityState } from '@models/entities/agents/states/agent.entity-state';
import { AgentState } from '@models/entities/agents/states/agent.state';
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
  ignorePauseUpdateUntil?: boolean;
  preAction?: (location: Location) => Promise<void>;
  postAction?: (location: Location) => Promise<void>;
}

export class WorldManager {
  private static readonly LOCK_TTL = 30000; // 30 seconds
  private static readonly LOCATION_LOCK_PREFIX = 'lock:location:';
  private static readonly AGENT_LOCK_PREFIX = 'lock:agent:';
  private static readonly AGENT_ENTITY_LOCK_PREFIX = 'lock:agent-entity:';
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

  private async withLocationLockNoRetry<T>(
    locationId: number,
    operation: () => Promise<T>
  ): Promise<T | null> {
    const lockKey = `${WorldManager.LOCATION_LOCK_PREFIX}${locationId}`;
    const lock = await this.redisLockService.acquireLockNoRetry(
      lockKey,
      WorldManager.LOCK_TTL
    );
    if (!lock) {
      return null;
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

  private async withAgentLock<T>(
    agentId: number,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${WorldManager.AGENT_LOCK_PREFIX}${agentId}`;
    const lock = await this.redisLockService.acquireLock(
      lockKey,
      WorldManager.LOCK_TTL
    );
    if (!lock) {
      throw new Error(`Failed to lock agent ${agentId}`);
    }
    try {
      return await operation();
    } finally {
      await lock.release();
    }
  }

  private async withAgentEntityLock<T>(
    agentId: number,
    targetAgentId: number | undefined,
    targetUserId: number | undefined,
    operation: () => Promise<T>
  ): Promise<T> {
    const entityKey = targetAgentId
      ? `agent:${targetAgentId}`
      : `user:${targetUserId}`;
    const lockKey = `${WorldManager.AGENT_ENTITY_LOCK_PREFIX}${agentId}:${entityKey}`;
    const lock = await this.redisLockService.acquireLock(
      lockKey,
      WorldManager.LOCK_TTL
    );
    if (!lock) {
      throw new Error(`Failed to lock agent entity ${agentId}:${entityKey}`);
    }
    try {
      return await operation();
    } finally {
      await lock.release();
    }
  }

  private async withUserLock<T>(
    userId: number,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${WorldManager.USER_LOCK_PREFIX}${userId}`;
    const lock = await this.redisLockService.acquireLock(
      lockKey,
      WorldManager.LOCK_TTL
    );
    if (!lock) {
      throw new Error(`Failed to lock user ${userId}`);
    }
    try {
      return await operation();
    } finally {
      await lock.release();
    }
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

    if (ENV.DEBUG) {
      console.log(`Location ${location.model.name} successfully saved`);
    }
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

  public async removeLocationAgent(
    locationId: number,
    agentId: number
  ): Promise<void> {
    await this.withLocationLock(locationId, async () => {
      const locationState = await this.getOrCreateLocationState(locationId);
      locationState.agentIds = locationState.agentIds.filter(
        (id) => id !== agentId
      );
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

  public async removeLocationUser(
    locationId: number,
    userId: number
  ): Promise<void> {
    await this.withLocationLock(locationId, async () => {
      const locationState = await this.getOrCreateLocationState(locationId);
      locationState.userIds = locationState.userIds.filter(
        (id) => id !== userId
      );
      locationState.dirty = true;

      await this.locationRepository.saveLocationState(locationState);
    });
  }

  public async setLocationPauseUpdateUntil(
    locationId: number,
    pauseUpdateUntil?: Date
  ): Promise<void> {
    await this.withLocationLock(locationId, async () => {
      const locationState = await this.getOrCreateLocationState(locationId);
      locationState.pauseUpdateUntil = pauseUpdateUntil;
      locationState.dirty = true;

      await this.locationRepository.saveLocationState(locationState);
    });
  }

  private async addLocationMessage(
    locationId: number,
    message: LocationMessage
  ): Promise<void> {
    await this.withLocationLock(locationId, async () => {
      const locationMessagesState =
        await this.getOrCreateLocationMessagesState(locationId);

      if (
        locationMessagesState.messages.find(
          (m) =>
            m.agentId === message.agentId &&
            m.userId === message.userId &&
            m.name === message.name &&
            new Date(m.createdAt).getTime() ===
              new Date(message.createdAt).getTime()
        )
      ) {
        return;
      }

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

  public async addLocationAgentMessage(
    locationId: number,
    agentId: number,
    name: string,
    message: string,
    createdAt?: Date
  ): Promise<void> {
    const locationMessage = new LocationMessage();
    locationMessage.agentId = agentId;
    locationMessage.name = name;
    locationMessage.message = message;
    if (createdAt) {
      locationMessage.createdAt = createdAt;
    }
    await this.addLocationMessage(locationId, locationMessage);
  }

  public async addLocationUserMessage(
    locationId: number,
    userId: number,
    name: string,
    message: string,
    createdAt?: Date
  ): Promise<void> {
    const locationMessage = new LocationMessage();
    locationMessage.userId = userId;
    locationMessage.name = name;
    locationMessage.message = message;
    if (createdAt) {
      locationMessage.createdAt = createdAt;
    }
    await this.addLocationMessage(locationId, locationMessage);
  }

  private async updateLocationInternal(
    llmApiKeyUserId: number,
    locationId: number,
    options: UpdateLocationOptions = {}
  ): Promise<Location> {
    const location = await this.getLocation(llmApiKeyUserId, locationId);

    if (
      !options.ignorePauseUpdateUntil &&
      location.state.pauseUpdateUntil &&
      location.state.pauseUpdateUntil > new Date()
    ) {
      return location;
    }

    if (options.preAction) {
      await options.preAction(location);
    }

    location.addAgentMemoryHook(
      async (location, agent, state, index, memory) => {
        void this.updateAgentStateMemory(state, index, memory);
      }
    );

    location.addAgentEntityMemoryHook(
      async (location, agent, state, index, memory) => {
        void this.updateAgentEntityStateMemory(state, index, memory);
      }
    );

    location.addAgentExpressionHook(
      async (location, agent, state, expression) => {
        void this.updateAgentExpression(state, expression);
      }
    );

    await location.update();

    if (options.postAction) {
      await options.postAction(location);
    }

    await this.saveLocation(location);
    return location;
  }

  public async updateLocation(
    llmApiKeyUserId: number,
    locationId: number,
    options: UpdateLocationOptions = {}
  ): Promise<Location> {
    return await this.withLocationLock(locationId, async () => {
      return await this.updateLocationInternal(
        llmApiKeyUserId,
        locationId,
        options
      );
    });
  }

  public async updateLocationNoRetry(
    llmApiKeyUserId: number,
    locationId: number,
    options: UpdateLocationOptions = {}
  ): Promise<Location | null> {
    return await this.withLocationLockNoRetry(locationId, async () => {
      return await this.updateLocationInternal(
        llmApiKeyUserId,
        locationId,
        options
      );
    });
  }

  public async updateAgentStateMemory(
    state: AgentState,
    index: number,
    memory: string
  ): Promise<void> {
    await this.withAgentLock(state.agentId, async () => {
      if (ENV.DEBUG) {
        console.log(
          `Updating agent ${state.agentId} memory at index ${index} to ${memory}`
        );
      }

      const agentState = await this.agentRepository.getAgentState(
        state.agentId
      );
      if (!agentState) {
        await this.agentRepository.saveAgentState(state);
        return;
      }

      if (agentState.memories[index]) {
        const emptyIndex = agentState.memories.findIndex((m) => !m);
        if (emptyIndex !== -1) {
          index = emptyIndex;
        }
      }

      agentState.memories[index] = memory;
      await this.agentRepository.saveAgentStateMemory(
        agentState,
        index,
        memory
      );
    });
  }

  public async updateAgentEntityStateMemory(
    state: AgentEntityState,
    index: number,
    memory: string
  ): Promise<void> {
    await this.withAgentEntityLock(
      state.agentId,
      state.targetAgentId,
      state.targetUserId,
      async () => {
        if (ENV.DEBUG) {
          console.log(
            `Updating agent entity ${state.agentId}:${state.targetAgentId}:${state.targetUserId} memory at index ${index} to ${memory}`
          );
        }

        const agentEntityState = await this.agentRepository.getAgentEntityState(
          state.agentId,
          state.targetAgentId,
          state.targetUserId
        );
        if (!agentEntityState) {
          await this.agentRepository.saveAgentEntityState(state);
          return;
        }

        if (agentEntityState.memories[index]) {
          const emptyIndex = agentEntityState.memories.findIndex((m) => !m);
          if (emptyIndex !== -1) {
            index = emptyIndex;
          }
        }

        agentEntityState.memories[index] = memory;
        await this.agentRepository.saveAgentEntityStateMemory(
          agentEntityState,
          index,
          memory
        );
      }
    );
  }

  public async updateAgentExpression(
    state: AgentState,
    expression: string
  ): Promise<void> {
    await this.withAgentLock(state.agentId, async () => {
      if (ENV.DEBUG) {
        console.log(
          `Updating agent ${state.agentId} expression to ${expression}`
        );
      }

      const agentState = await this.agentRepository.getAgentState(
        state.agentId
      );
      if (!agentState) {
        await this.agentRepository.saveAgentState(state);
        return;
      }

      agentState.expression = expression;
      await this.agentRepository.saveAgentExpression(agentState, expression);
    });
  }
}
