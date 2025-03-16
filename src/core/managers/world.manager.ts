import { ENV } from '@little-samo/samo-ai/common';
import {
  Agent,
  AgentEntityState,
  AgentId,
  AgentState,
  Entity,
  EntityId,
  EntityKey,
  EntityType,
  ItemDataId,
  ItemModel,
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
  ItemOwner,
  ItemsRepository,
  LocationsRepository,
  UsersRepository,
} from '../repositories';
import { RedisLockService } from '../services';

interface UpdateLocationOptions {
  ignorePauseUpdateUntil?: boolean;
  preAction?: (location: Location) => Promise<void>;
  postAction?: (location: Location) => Promise<void>;
  handleSave?: <T = void>(save: Promise<T>) => Promise<void>;
}

export class WorldManager extends AsyncEventEmitter {
  private static readonly LOCATION_UPDATE_LOCK_TTL = 5000; // 5 seconds
  private static readonly LOCATION_UPDATE_LOCK_PREFIX = 'lock:location-update:';

  private static _instance: WorldManager;

  public static initialize(
    redisLockService: RedisLockService,
    locationRepository: LocationsRepository,
    agentRepository: AgentsRepository,
    userRepository: UsersRepository,
    itemsRepository: ItemsRepository
  ) {
    WorldManager._instance = new WorldManager(
      redisLockService,
      locationRepository,
      agentRepository,
      userRepository,
      itemsRepository
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
    public readonly userRepository: UsersRepository,
    public readonly itemsRepository: ItemsRepository
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

  public async getLocation(
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
      if (
        Object.keys(lastUserMessageAt).length >=
        location.meta.agentUserContextLimit
      ) {
        agentContextUserIds = Object.keys(lastUserMessageAt).map(
          (userId) => Number(userId) as UserId
        );
      } else {
        agentContextUserIds = [...agentContextUserIds];
      }
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
      if (
        Object.keys(lastUserMessageAt).length >= location.meta.userContextLimit
      ) {
        locationContextUserIds = Object.keys(lastUserMessageAt).map(
          (userId) => Number(userId) as UserId
        );
      } else {
        locationContextUserIds = [...locationContextUserIds];
      }
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

    const items = await this.itemsRepository.getEntityItemModels(
      Object.values(agents).map((agent) => agent.id),
      Object.values(users).map((user) => user.id)
    );

    for (const agent of Object.values(agents)) {
      agent.setItems(items[agent.key] ?? []);
      location.addEntity(agent, false);
    }
    for (const user of Object.values(users)) {
      user.setItems(items[user.key] ?? []);
      location.addEntity(user, false);
    }

    const entityStates =
      await this.locationRepository.getOrCreateLocationEntityStates(
        locationId,
        Object.values(location.agents).map((agent) => agent.id),
        Object.values(location.users).map((user) => user.id)
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
      const agent = new Agent(location, agentModels[agentId], {
        state: agentStates[agentId],
      });

      const entityStates = agentEntityStates[agentId];
      if (entityStates) {
        for (const entityState of entityStates) {
          agent.addEntityState(entityState);
        }
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
      users[userId] = new User(location, userModels[userId], {
        state: userStates[userId],
      });
    }

    return users;
  }

  public async addLoationMessage(
    locationId: LocationId,
    message: LocationMessage,
    maxMessages?: number
  ): Promise<void> {
    await this.locationRepository.addLocationMessage(
      locationId,
      message,
      maxMessages
    );
    await this.emitAsync('locationMessageAdded', locationId, message);
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
      maxMessages?: number;
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
    await this.addLoationMessage(
      locationId,
      locationMessage,
      options.maxMessages
    );
  }

  public async addLocationAgentGreetingMessage(
    locationId: LocationId,
    agentId: AgentId,
    name: string,
    greeting: string,
    createdAt?: Date,
    options: {
      maxMessages?: number;
    } = {}
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

      await this.addLoationMessage(locationId, message, options.maxMessages);
    }
  }

  public async addLocationAgentActionMessage(
    locationId: LocationId,
    agentId: AgentId,
    name: string,
    action: string,
    createdAt?: Date,
    options: {
      maxMessages?: number;
    } = {}
  ): Promise<void> {
    const message: LocationMessage = {
      entityType: EntityType.Agent,
      entityId: agentId,
      name,
      action,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };

    await this.addLoationMessage(locationId, message, options.maxMessages);
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
      maxMessages?: number;
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
    await this.addLoationMessage(
      locationId,
      locationMessage,
      options.maxMessages
    );
  }

  public async addLocationSystemMessage(
    locationId: LocationId,
    message: string,
    createdAt?: Date,
    options: {
      maxMessages?: number;
    } = {}
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      entityType: EntityType.System,
      entityId: 0 as EntityId,
      name: '[SYSTEM]',
      message,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    await this.addLoationMessage(
      locationId,
      locationMessage,
      options.maxMessages
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

    options.handleSave ??= async <T>(save: Promise<T>) => {
      await save;
    };

    const location = await this.getLocation(locationId, {
      llmApiKeyUserId,
    });
    if (Object.keys(location.agents).length === 0) {
      console.log(`No agents in location ${locationId}, pausing update`);
      await this.locationRepository.updateLocationStatePauseUpdateUntil(
        locationId,
        null
      );
      return location;
    }

    if (
      !options.ignorePauseUpdateUntil &&
      location.state.pauseUpdateUntil &&
      new Date(location.state.pauseUpdateUntil).getTime() > Date.now()
    ) {
      if (ENV.DEBUG) {
        console.log(
          `Location ${locationId} paused update until ${location.state.pauseUpdateUntil}`
        );
      }
      return location;
    }

    if (options.preAction) {
      await options.preAction(location);
    }

    location.on('agentExecuteNextActions', async (agent: Agent) => {
      await this.emitAsync('locationAgentExecution', locationId, agent);
    });

    location.on(
      'messageAdded',
      (location: Location, message: LocationMessage) => {
        void options.handleSave!(
          this.addLoationMessage(
            location.id,
            message,
            location.meta.messageLimit
          )
        );
      }
    );

    location.on(
      'agentUpdateMemory',
      (agent: Agent, state: AgentState, index: number, memory: string) => {
        void options.handleSave!(
          this.agentRepository.updateAgentStateMemory(
            agent.model.id as AgentId,
            index,
            memory
          )
        );
      }
    );

    location.on(
      'agentUpdateEntityMemory',
      (
        agent: Agent,
        state: AgentEntityState,
        index: number,
        memory: string
      ) => {
        void options.handleSave!(
          this.agentRepository.updateAgentEntityStateMemory(
            agent.model.id as AgentId,
            state.targetType,
            state.targetId,
            index,
            memory
          )
        );
      }
    );

    location.on(
      'agentUpdateExpression',
      (agent: Agent, state: LocationEntityState, expression: string) => {
        void options.handleSave!(
          this.locationRepository.updateLocationEntityStateExpression(
            locationId,
            state.targetType,
            state.targetId,
            expression
          )
        );
      }
    );

    location.on(
      'agentUpdateActive',
      (agent: Agent, state: LocationEntityState, isActive: boolean) => {
        void options.handleSave!(
          this.locationRepository.updateLocationEntityStateIsActive(
            locationId,
            state.targetType,
            state.targetId,
            isActive
          )
        );
      }
    );

    location.on(
      'entityAddItem',
      async (
        entity: Entity,
        dataId: ItemDataId,
        count: number,
        stackable: boolean
      ) => {
        const itemOwner: ItemOwner = {
          ownerAgentId: entity.type === EntityType.Agent ? entity.id : null,
          ownerUserId: entity.type === EntityType.User ? entity.id : null,
        };
        if (stackable) {
          await options.handleSave!(
            this.itemsRepository.addOrCreateItemModel(itemOwner, dataId, count)
          );
        } else {
          for (let i = 0; i < count; i++) {
            await options.handleSave!(
              this.itemsRepository.addOrCreateItemModel(itemOwner, dataId, 1)
            );
          }
        }
      }
    );

    location.on(
      'entityRemoveItem',
      (entity: Entity, item: ItemModel, count: number) => {
        const itemOwner: ItemOwner = {
          ownerAgentId: entity.type === EntityType.Agent ? entity.id : null,
          ownerUserId: entity.type === EntityType.User ? entity.id : null,
        };
        void options.handleSave!(
          this.itemsRepository.removeItemModel(itemOwner, item, count)
        );
      }
    );

    location.on(
      'entityTransferItem',
      (
        entity: Entity,
        item: ItemModel,
        count: number,
        targetEntityKey: EntityKey
      ) => {
        const itemOwner: ItemOwner = {
          ownerAgentId: entity.type === EntityType.Agent ? entity.id : null,
          ownerUserId: entity.type === EntityType.User ? entity.id : null,
        };
        const [targetEntityType, targetEntityId] = targetEntityKey.split(':');
        const targetItemOwner: ItemOwner = {
          ownerAgentId:
            targetEntityType === EntityType.Agent
              ? (Number(targetEntityId) as AgentId)
              : null,
          ownerUserId:
            targetEntityType === EntityType.User
              ? (Number(targetEntityId) as UserId)
              : null,
        };
        void options.handleSave!(
          this.itemsRepository.transferItemModel(
            itemOwner,
            item,
            targetItemOwner,
            count
          )
        );
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
