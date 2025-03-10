import { ENV } from '@little-samo/samo-ai/common';
import {
  Agent,
  AgentEntityState,
  AgentId,
  AgentState,
  EntityId,
  EntityType,
  Location,
  LocationEntityState,
  LocationId,
  LocationMessage,
  LocationMeta,
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
  private static readonly LOCATION_UPDATE_LOCK_TTL = 30000; // 30 seconds
  private static readonly LOCATION_UPDATE_LOCK_PREFIX = 'lock:location-update:';

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
    public readonly locationRepository: LocationsRepository,
    public readonly agentRepository: AgentsRepository,
    public readonly userRepository: UsersRepository
  ) {
    super();
  }

  private async withLocationUpdateLock<T>(
    locationId: LocationId,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${WorldManager.LOCATION_UPDATE_LOCK_PREFIX}${locationId}`;
    const lock = await this.redisLockService.acquireLock(
      lockKey,
      WorldManager.LOCATION_UPDATE_LOCK_TTL
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

  private async withLocationUpdateLockNoRetry<T>(
    locationId: LocationId,
    operation: () => Promise<T>
  ): Promise<T | null> {
    const lockKey = `${WorldManager.LOCATION_UPDATE_LOCK_PREFIX}${locationId}`;
    const lock = await this.redisLockService.acquireLockNoRetry(
      lockKey,
      WorldManager.LOCATION_UPDATE_LOCK_TTL
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
      await this.locationRepository.getOrCreateLocationState(locationId);
    const locationMessagesState =
      await this.locationRepository.getOrCreateLocationMessagesState(
        locationId
      );

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
          if (message.entityType == EntityType.User) {
            acc[message.entityId as UserId] = new Date(message.createdAt);
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
            if (message.entityType == EntityType.User) {
              acc[message.entityId as UserId] = new Date(message.createdAt);
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

    const entityStates =
      await this.locationRepository.getOrCreateLocationEntityStates(
        locationId,
        location.state.agentIds,
        location.state.userIds
      );
    for (const entityState of entityStates) {
      location.addEntityState(entityState);
    }

    return location;
  }

  private async getAgents(
    location: Location,
    agentIds: AgentId[],
    userIds: UserId[]
  ): Promise<Record<AgentId, Agent>> {
    const agentModels = await this.agentRepository.getAgentModels(agentIds);
    agentIds = agentIds.filter((agentId) => agentModels[agentId]?.isActive);

    const agentStates =
      await this.agentRepository.getOrCreateAgentStates(agentIds);
    const agentEntityStates =
      await this.agentRepository.getOrCreateAgentEntityStates(
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
        agent.getOrCreateEntityStateByTarget(EntityType.Agent, otherAgentId);
      }
      for (const otherUserId of userIds) {
        agent.getOrCreateEntityStateByTarget(EntityType.User, otherUserId);
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
    const userStates = await this.userRepository.getOrCreateUserStates(userIds);

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
      entityType: EntityType.Agent,
      entityId: agentId,
      targetEntityType: options?.targetEntityType,
      targetEntityId: options?.targetEntityId,
      name,
      message,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    await this.locationRepository.addLocationMessage(
      locationId,
      locationMessage
    );
  }

  public async addLocationAgentGreetingMessage(
    locationId: LocationId,
    agentId: AgentId,
    name: string,
    greeting: string,
    createdAt?: Date
  ): Promise<void> {
    const locationMessagesState =
      await this.locationRepository.getOrCreateLocationMessagesState(
        locationId
      );

    if (locationMessagesState.messages.length === 0) {
      const message: LocationMessage = {
        entityType: EntityType.Agent,
        entityId: agentId,
        name,
        message: greeting,
        createdAt: createdAt ?? new Date(),
        updatedAt: new Date(),
      };

      await this.locationRepository.addLocationMessage(locationId, message);
    }
  }

  public async addLocationAgentActionMessage(
    locationId: LocationId,
    agentId: AgentId,
    name: string,
    action: string,
    createdAt?: Date
  ): Promise<void> {
    const message: LocationMessage = {
      entityType: EntityType.Agent,
      entityId: agentId,
      name,
      action,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };

    await this.locationRepository.addLocationMessage(locationId, message);
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
      entityType: EntityType.User,
      entityId: userId,
      targetEntityType: options?.targetEntityType,
      targetEntityId: options?.targetEntityId,
      name,
      message,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    await this.locationRepository.addLocationMessage(
      locationId,
      locationMessage
    );
  }

  public async addLocationSystemMessage(
    locationId: LocationId,
    message: string,
    createdAt?: Date
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      entityType: EntityType.System,
      entityId: 0 as EntityId,
      name: '[SYSTEM]',
      message,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    await this.locationRepository.addLocationMessage(
      locationId,
      locationMessage
    );
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
      await this.locationRepository.updateLocationStatePauseUpdateUntil(
        locationId,
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

    location.on('agentExecuteNextActions', async (agent: Agent) => {
      await this.emitAsync('locationAgentExecution', locationId, agent);
    });

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
            this.agentRepository.updateAgentStateMemory(
              agent.model.id as AgentId,
              index,
              memory
            )
          );
        } else {
          void this.agentRepository.updateAgentStateMemory(
            agent.model.id as AgentId,
            index,
            memory
          );
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
            this.agentRepository.updateAgentEntityStateMemory(
              agent.model.id as AgentId,
              state.targetType,
              state.targetId,
              index,
              memory
            )
          );
        } else {
          void this.agentRepository.updateAgentEntityStateMemory(
            agent.model.id as AgentId,
            state.targetType,
            state.targetId,
            index,
            memory
          );
        }
      }
    );

    location.on(
      'agentUpdateExpression',
      async (agent: Agent, state: LocationEntityState, expression: string) => {
        if (options.handleSave) {
          void options.handleSave(
            this.locationRepository.updateLocationEntityStateExpression(
              locationId,
              state.targetType,
              state.targetId,
              expression
            )
          );
        } else {
          void this.locationRepository.updateLocationEntityStateExpression(
            locationId,
            state.targetType,
            state.targetId,
            expression
          );
        }
      }
    );

    location.on(
      'agentUpdateActive',
      async (agent: Agent, state: LocationEntityState, isActive: boolean) => {
        if (options.handleSave) {
          void options.handleSave(
            this.locationRepository.updateLocationEntityStateIsActive(
              locationId,
              state.targetType,
              state.targetId,
              isActive
            )
          );
        } else {
          void this.locationRepository.updateLocationEntityStateIsActive(
            locationId,
            state.targetType,
            state.targetId,
            isActive
          );
        }
      }
    );

    let pauseUpdateDuration;
    try {
      pauseUpdateDuration = await location.update();
    } catch (error) {
      await this.locationRepository.updateLocationStatePauseUpdateUntil(
        locationId,
        null
      );
      throw error;
    }
    if (pauseUpdateDuration) {
      const pauseUpdateUntil = new Date(Date.now() + pauseUpdateDuration);
      if (ENV.DEBUG) {
        console.log(
          `Setting location ${location.model.name} pause update until ${pauseUpdateUntil}`
        );
      }
      await this.locationRepository.updateLocationStatePauseUpdateUntil(
        locationId,
        pauseUpdateUntil
      );
    } else {
      if (ENV.DEBUG) {
        console.log(`Location ${location.model.name} paused update`);
      }
      await this.locationRepository.updateLocationStatePauseUpdateUntil(
        locationId,
        null
      );
    }

    if (options.postAction) {
      await options.postAction(location);
    }

    return location;
  }

  public async updateLocation(
    llmApiKeyUserId: UserId,
    locationId: LocationId,
    options: UpdateLocationOptions = {}
  ): Promise<Location> {
    return await this.withLocationUpdateLock(locationId, async () => {
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
    return await this.withLocationUpdateLockNoRetry(locationId, async () => {
      return await this.updateLocationInternal(
        llmApiKeyUserId,
        locationId,
        options
      );
    });
  }
}
