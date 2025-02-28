import { ENV } from '@little-samo/samo-ai/common';
import {
  Agent,
  AgentEntityState,
  AgentId,
  AgentState,
  DEFAULT_LOCATION_META,
  EntityId,
  EntityKey,
  EntityType,
  Location,
  LocationEntityState,
  LocationId,
  LocationMessage,
  LocationMessagesState,
  LocationMeta,
  LocationState,
  User,
  UserId,
} from '@little-samo/samo-ai/models';
import { AsyncEventEmitter } from '@little-samo/samo-ai/common';

import {
  AgentsRepository,
  LocationsRepository,
  UsersRepository,
} from '../repositories';
import { RedisLockService } from '../services';

interface UpdateLocationOptions {
  ignorePauseUpdateUntil?: boolean;
  preAction?: (location: Location) => Promise<void>;
  postAction?: (location: Location) => Promise<void>;
  handleSave?: (save: Promise<void>) => Promise<void>;
}

export class WorldManager extends AsyncEventEmitter {
  private static readonly LOCK_TTL = 5000; // 5 seconds
  private static readonly LOCATION_LOCK_TTL = 30000; // 30 seconds
  private static readonly LOCATION_LOCK_PREFIX = 'lock:location:';
  private static readonly LOCATION_ENTITY_LOCK_PREFIX = 'lock:location-entity:';
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
  ) {
    super();
  }

  private async withLocationLock<T>(
    locationId: number,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${WorldManager.LOCATION_LOCK_PREFIX}${locationId}`;
    const lock = await this.redisLockService.acquireLock(
      lockKey,
      WorldManager.LOCATION_LOCK_TTL
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
      WorldManager.LOCATION_LOCK_TTL
    );
    if (!lock) {
      if (ENV.DEBUG) {
        console.log(`Failed to lock location ${locationId} (no retry)`);
      }
      return null;
    }
    try {
      return await operation();
    } finally {
      await lock.release();
    }
  }

  private async withLocationEntityLock<T>(
    locationId: number,
    targetType: EntityType,
    targetId: number,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${WorldManager.LOCATION_ENTITY_LOCK_PREFIX}${locationId}:${targetType}:${targetId}`;
    const lock = await this.redisLockService.acquireLock(
      lockKey,
      WorldManager.LOCK_TTL
    );
    if (!lock) {
      throw new Error(
        `Failed to lock location entity ${locationId}:${targetType}:${targetId}`
      );
    }
    try {
      return await operation();
    } finally {
      await lock.release();
    }
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
    type: EntityType,
    id: EntityId,
    operation: () => Promise<T>
  ): Promise<T> {
    const entityKey = `${type}:${id}` as EntityKey;
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
    locationId: LocationId,
    options: {
      defaultMeta?: LocationMeta;
      llmApiKeyUserId?: UserId;
    } = {}
  ): Promise<Location> {
    const apiKeys =
      options.llmApiKeyUserId &&
      (await this.userRepository.getUserLlmApiKeys(options.llmApiKeyUserId));

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
      defaultMeta: options.defaultMeta,
    });

    let lastUserMessageAt: Record<UserId, Date> | undefined = undefined;
    let agentContextUserIds = location.state.userIds;
    if (agentContextUserIds.length > location.meta.agentUserContextLimit) {
      lastUserMessageAt = location.messagesState.messages.reduce(
        (acc, message) => {
          if (message.entityType == EntityType.USER) {
            acc[message.entityId as UserId] = message.createdAt;
          }
          return acc;
        },
        {} as Record<UserId, Date>
      );
      agentContextUserIds = [...agentContextUserIds];
      agentContextUserIds.sort(
        (a, b) =>
          (lastUserMessageAt![b]?.getTime() ?? Math.random()) -
          (lastUserMessageAt![a]?.getTime() ?? Math.random())
      );
      agentContextUserIds = agentContextUserIds.slice(
        0,
        location.meta.agentUserContextLimit
      );
    }
    const agents = await this.getAgents(
      location,
      location.state.agentIds,
      agentContextUserIds
    );

    let locationContextUserIds = location.state.userIds;
    if (locationContextUserIds.length > location.meta.userContextLimit) {
      if (!lastUserMessageAt) {
        lastUserMessageAt = location.messagesState.messages.reduce(
          (acc, message) => {
            if (message.entityType == EntityType.USER) {
              acc[message.entityId as UserId] = message.createdAt;
            }
            return acc;
          },
          {} as Record<UserId, Date>
        );
      }
      locationContextUserIds = [...locationContextUserIds];
      locationContextUserIds.sort(
        (a, b) =>
          (lastUserMessageAt![b]?.getTime() ?? Math.random()) -
          (lastUserMessageAt![a]?.getTime() ?? Math.random())
      );
      locationContextUserIds = locationContextUserIds.slice(
        0,
        location.meta.userContextLimit
      );
    }
    const users = await this.getUsers(location, locationContextUserIds);

    for (const agent of Object.values(agents)) {
      location.addEntity(agent, false);
    }
    for (const user of Object.values(users)) {
      location.addEntity(user, false);
    }

    const entityStates = await this.locationRepository.getLocationEntityStates(
      locationId,
      location.state.agentIds,
      location.state.userIds
    );
    for (const entityState of entityStates) {
      location.addEntityState(entityState);
    }

    return location;
  }

  private async getOrCreateLocationState(
    locationId: LocationId
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
    locationId: LocationId
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
    agentIds: AgentId[],
    userIds: UserId[]
  ): Promise<Record<AgentId, Agent>> {
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
        agent.getOrCreateEntityStateByTarget(EntityType.AGENT, otherAgentId);
      }
      for (const otherUserId of userIds) {
        agent.getOrCreateEntityStateByTarget(EntityType.USER, otherUserId);
      }

      agents[agentId] = agent;
    }

    return agents;
  }

  private async getUsers(
    location: Location,
    userIds: UserId[]
  ): Promise<Record<UserId, User>> {
    const userModels = await this.userRepository.getUserModels(userIds);
    const userStates = await this.userRepository.getUserStates(userIds);

    const users: Record<UserId, User> = {};
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
    locationId: LocationId,
    agentId: AgentId
  ): Promise<boolean> {
    let locationState =
      await this.locationRepository.getLocationState(locationId);
    if (locationState && locationState.agentIds.includes(agentId)) {
      return false;
    }
    return await this.withLocationLock(locationId, async () => {
      locationState = await this.getOrCreateLocationState(locationId);
      if (locationState.agentIds.includes(agentId)) {
        return false;
      }

      locationState.userIds = locationState.userIds.filter(
        (id) => (id as EntityId) !== (agentId as EntityId)
      );
      locationState.agentIds.push(agentId);
      locationState.dirty = true;

      await this.locationRepository.saveLocationState(locationState);
      return true;
    });
  }

  public async removeLocationAgent(
    locationId: LocationId,
    agentId: AgentId
  ): Promise<boolean> {
    let locationState =
      await this.locationRepository.getLocationState(locationId);
    if (locationState && !locationState.agentIds.includes(agentId)) {
      return false;
    }
    return await this.withLocationLock(locationId, async () => {
      locationState = await this.getOrCreateLocationState(locationId);
      if (!locationState.agentIds.includes(agentId)) {
        return false;
      }

      locationState.agentIds = locationState.agentIds.filter(
        (id) => id !== agentId
      );
      locationState.dirty = true;

      await this.locationRepository.saveLocationState(locationState);
      return true;
    });
  }

  public async addLocationUser(
    locationId: LocationId,
    userId: UserId,
    callback?: (userAdded: boolean, location: Location) => Promise<void>
  ): Promise<boolean> {
    let locationState =
      await this.locationRepository.getLocationState(locationId);
    if (locationState && locationState.userIds.includes(userId)) {
      return false;
    }
    return await this.withLocationLock(locationId, async () => {
      locationState = await this.getOrCreateLocationState(locationId);
      if (locationState.userIds.includes(userId)) {
        if (callback) {
          const location = await this.getLocation(locationId);
          await callback(false, location);
        }
        return false;
      }

      locationState.userIds.push(userId);
      locationState.dirty = true;

      await this.locationRepository.saveLocationState(locationState);
      if (callback) {
        const location = await this.getLocation(locationId);
        await callback(true, location);
      }
      return true;
    });
  }

  public async removeLocationUser(
    locationId: LocationId,
    userId: UserId
  ): Promise<boolean> {
    let locationState =
      await this.locationRepository.getLocationState(locationId);
    if (locationState && !locationState.userIds.includes(userId)) {
      return false;
    }
    return await this.withLocationLock(locationId, async () => {
      locationState = await this.getOrCreateLocationState(locationId);
      if (!locationState.userIds.includes(userId)) {
        return false;
      }

      locationState.userIds = locationState.userIds.filter(
        (id) => id !== userId
      );
      locationState.dirty = true;

      await this.locationRepository.saveLocationState(locationState);
      return true;
    });
  }

  private async setLocationPauseUpdateUntilInternal(
    locationId: LocationId,
    pauseUpdateUntil: Date | null
  ): Promise<void> {
    const locationState = await this.getOrCreateLocationState(locationId);
    locationState.pauseUpdateUntil = pauseUpdateUntil;
    locationState.dirty = true;

    await this.locationRepository.saveLocationState(locationState);
  }

  public async setLocationPauseUpdateUntil(
    locationId: LocationId,
    pauseUpdateUntil: Date | null
  ): Promise<void> {
    const locationState = await this.getOrCreateLocationState(locationId);
    if (locationState.pauseUpdateUntil === pauseUpdateUntil) {
      return;
    }

    await this.withLocationLock(locationId, async () => {
      await this.setLocationPauseUpdateUntilInternal(
        locationId,
        pauseUpdateUntil
      );
    });
  }

  private async addLocationMessage(
    locationId: LocationId,
    message: LocationMessage
  ): Promise<void> {
    const locationMessagesState =
      await this.locationRepository.getLocationMessagesState(locationId);
    if (
      locationMessagesState &&
      locationMessagesState.messages.find(
        (m) =>
          m.entityType === message.entityType &&
          m.entityId === message.entityId &&
          m.name === message.name &&
          new Date(m.createdAt).getTime() ===
            new Date(message.createdAt).getTime()
      )
    ) {
      return;
    }

    await this.withLocationLock(locationId, async () => {
      const locationMessagesState =
        await this.getOrCreateLocationMessagesState(locationId);

      if (
        locationMessagesState.messages.find(
          (m) =>
            m.entityType === message.entityType &&
            m.entityId === message.entityId &&
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

      await this.emitAsync('locationMessageAdded', locationId, message);
    });
  }

  public async addLocationAgentMessage(
    locationId: LocationId,
    agentId: AgentId,
    name: string,
    message: string,
    createdAt?: Date,
    options: {
      targetEntityType?: EntityType;
      targetEntityId?: EntityId;
    } = {}
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      entityType: EntityType.AGENT,
      entityId: agentId,
      targetEntityType: options?.targetEntityType,
      targetEntityId: options?.targetEntityId,
      name,
      message,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    await this.addLocationMessage(locationId, locationMessage);
  }

  public async addLocationAgentGreetingMessage(
    locationId: LocationId,
    agentId: AgentId,
    name: string,
    greeting: string,
    createdAt?: Date
  ): Promise<void> {
    await this.withLocationLock(locationId, async () => {
      const locationMessagesState =
        await this.getOrCreateLocationMessagesState(locationId);
      if (locationMessagesState.messages.length > 0) {
        return;
      }

      const message: LocationMessage = {
        entityType: EntityType.AGENT,
        entityId: agentId,
        name,
        message: greeting,
        createdAt: createdAt ?? new Date(),
        updatedAt: new Date(),
      };

      locationMessagesState.messages.push(message);
      locationMessagesState.dirty = true;

      await this.locationRepository.saveLocationMessagesState(
        locationMessagesState
      );
    });
  }

  public async addLocationAgentActionMessage(
    locationId: LocationId,
    agentId: AgentId,
    name: string,
    action: string,
    createdAt?: Date
  ): Promise<void> {
    await this.withLocationLock(locationId, async () => {
      const locationMessagesState =
        await this.getOrCreateLocationMessagesState(locationId);
      if (locationMessagesState.messages.length > 0) {
        return;
      }

      const message: LocationMessage = {
        entityType: EntityType.AGENT,
        entityId: agentId,
        name,
        action,
        createdAt: createdAt ?? new Date(),
        updatedAt: new Date(),
      };

      locationMessagesState.messages.push(message);
      locationMessagesState.dirty = true;

      await this.locationRepository.saveLocationMessagesState(
        locationMessagesState
      );
    });
  }

  public async addLocationUserMessage(
    locationId: LocationId,
    userId: UserId,
    name: string,
    message: string,
    createdAt?: Date,
    options: {
      targetEntityType?: EntityType;
      targetEntityId?: EntityId;
    } = {}
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      entityType: EntityType.USER,
      entityId: userId,
      targetEntityType: options?.targetEntityType,
      targetEntityId: options?.targetEntityId,
      name,
      message,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    await this.addLocationMessage(locationId, locationMessage);
  }

  public async addLocationSystemMessage(
    locationId: LocationId,
    message: string,
    createdAt?: Date
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      entityType: EntityType.SYSTEM,
      entityId: 0 as EntityId,
      name: '[SYSTEM]',
      message,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    await this.addLocationMessage(locationId, locationMessage);
  }

  private async updateLocationInternal(
    llmApiKeyUserId: UserId,
    locationId: LocationId,
    options: UpdateLocationOptions = {}
  ): Promise<Location> {
    if (ENV.DEBUG) {
      console.log(`Updating location ${locationId}`);
    }

    const location = await this.getLocation(locationId, {
      llmApiKeyUserId,
    });
    if (Object.keys(location.agents).length === 0) {
      await this.setLocationPauseUpdateUntilInternal(
        location.model.id as LocationId,
        null
      );
      return location;
    }

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

    location.on('messageAdded', async (message: LocationMessage) => {
      await this.emitAsync('locationMessageAdded', locationId, message);
    });

    location.on(
      'agentUpdateMemory',
      async (
        agent: Agent,
        state: AgentState,
        index: number,
        memory: string
      ) => {
        if (options.handleSave) {
          void options.handleSave(
            this.updateAgentStateMemory(state, index, memory)
          );
        } else {
          void this.updateAgentStateMemory(state, index, memory);
        }
      }
    );

    location.on(
      'agentUpdateEntityMemory',
      async (
        agent: Agent,
        state: AgentEntityState,
        index: number,
        memory: string
      ) => {
        if (options.handleSave) {
          void options.handleSave(
            this.updateAgentEntityStateMemory(state, index, memory)
          );
        } else {
          void this.updateAgentEntityStateMemory(state, index, memory);
        }
      }
    );

    location.on(
      'agentUpdateExpression',
      async (agent: Agent, state: LocationEntityState, expression: string) => {
        if (options.handleSave) {
          void options.handleSave(
            this.updateAgentExpression(state, expression)
          );
        } else {
          void this.updateAgentExpression(state, expression);
        }
      }
    );

    let pauseUpdateDuration;
    try {
      pauseUpdateDuration = await location.update();
    } catch (error) {
      await this.setLocationPauseUpdateUntilInternal(locationId, null);
      throw error;
    }
    if (pauseUpdateDuration) {
      const pauseUpdateUntil = new Date(Date.now() + pauseUpdateDuration);
      if (ENV.DEBUG) {
        console.log(
          `Setting location ${location.model.name} pause update until ${pauseUpdateUntil}`
        );
      }
      await this.setLocationPauseUpdateUntilInternal(
        locationId,
        pauseUpdateUntil
      );
    } else {
      if (ENV.DEBUG) {
        console.log(`Location ${location.model.name} paused update`);
      }
      await this.setLocationPauseUpdateUntilInternal(locationId, null);
    }

    if (options.postAction) {
      await options.postAction(location);
    }

    await this.saveLocation(location);
    return location;
  }

  public async updateLocation(
    llmApiKeyUserId: UserId,
    locationId: LocationId,
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
    llmApiKeyUserId: UserId,
    locationId: LocationId,
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

      if (!state.memories[index] && agentState.memories[index]) {
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
      state.targetType,
      state.targetId,
      async () => {
        if (ENV.DEBUG) {
          console.log(
            `Updating agent entity ${state.agentId}:${state.targetType}:${state.targetId} memory at index ${index} to ${memory}`
          );
        }

        const agentEntityState = await this.agentRepository.getAgentEntityState(
          state.agentId,
          state.targetType,
          state.targetId
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
    state: LocationEntityState,
    expression: string
  ): Promise<void> {
    await this.withLocationEntityLock(
      state.locationId,
      state.targetType,
      state.targetId,
      async () => {
        if (ENV.DEBUG) {
          console.log(
            `Updating agent ${state.targetId} expression to ${expression}`
          );
        }

        const locationEntityState =
          await this.locationRepository.getLocationEntityState(
            state.locationId,
            state.targetType,
            state.targetId
          );
        if (!locationEntityState) {
          await this.locationRepository.saveLocationEntityState(state);
          return;
        }

        locationEntityState.expression = expression;
        await this.locationRepository.saveLocationEntityStateExpression(
          locationEntityState,
          expression
        );
      }
    );
  }
}
