import { ENV, LlmMessage, LlmToolCall } from '@little-samo/samo-ai/common';
import { AsyncEventEmitter } from '@little-samo/samo-ai/common';
import {
  Agent,
  AgentEntityState,
  AgentId,
  AgentState,
  Entity,
  EntityId,
  EntityKey,
  EntityType,
  Gimmick,
  GimmickId,
  GimmickParameters,
  ItemDataId,
  ItemModel,
  Location,
  LocationEntityState,
  LocationId,
  LocationMessage,
  LocationMeta,
  LocationModel,
  User,
  UserId,
  LocationPauseReason,
} from '@little-samo/samo-ai/models';

import {
  AgentRepository,
  GimmickRepository,
  ItemRepository,
  LocationRepository,
  UserRepository,
} from '../repositories';
import { LockService, InMemoryLockService } from '../services';

interface UpdateLocationOptions {
  ignorePauseUpdateUntil?: boolean;
  executeSpecificAgentId?: AgentId;
  preLoadLocation?: (locationModel: LocationModel) => Promise<void>;
  preAction?: (location: Location) => Promise<void>;
  postAction?: (location: Location) => Promise<void>;
  handleSave?: <T = void>(save: Promise<T>) => Promise<void>;
}

export interface WorldManagerOptions {
  lockService?: LockService;
  locationRepository: LocationRepository;
  agentRepository: AgentRepository;
  userRepository: UserRepository;
  gimmickRepository: GimmickRepository;
  itemRepository: ItemRepository;
}

export class WorldManager extends AsyncEventEmitter {
  private static readonly LOCATION_UPDATE_LOCK_TTL = 30000; // 30 seconds
  private static readonly LOCATION_UPDATE_LOCK_PREFIX = 'lock:location-update:';
  private static readonly AGENT_SUMMARY_UPDATE_LOCK_TTL = 15000; // 15 seconds
  private static readonly AGENT_SUMMARY_UPDATE_LOCK_PREFIX =
    'lock:agent-summary-update:';
  private static readonly AGENT_MEMORY_UPDATE_LOCK_TTL = 15000; // 15 seconds
  private static readonly AGENT_MEMORY_UPDATE_LOCK_PREFIX =
    'lock:agent-memory-update:';

  private static _instance: WorldManager;

  public static initialize(options: WorldManagerOptions) {
    WorldManager._instance = new WorldManager(options);
  }

  public static get instance() {
    if (!this._instance) {
      throw new Error('WorldManager not initialized');
    }
    return this._instance;
  }

  private readonly lockService: LockService;
  public readonly locationRepository: LocationRepository;
  public readonly agentRepository: AgentRepository;
  public readonly userRepository: UserRepository;
  public readonly gimmickRepository: GimmickRepository;
  public readonly itemRepository: ItemRepository;

  private constructor(options: WorldManagerOptions) {
    super();
    this.lockService = options.lockService || new InMemoryLockService();
    this.locationRepository = options.locationRepository;
    this.agentRepository = options.agentRepository;
    this.userRepository = options.userRepository;
    this.gimmickRepository = options.gimmickRepository;
    this.itemRepository = options.itemRepository;
  }

  private async withLocationUpdateLock<T>(
    locationId: LocationId,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${WorldManager.LOCATION_UPDATE_LOCK_PREFIX}${locationId}`;
    const lock = await this.lockService.acquireLock(
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
    const lock = await this.lockService.acquireLockNoRetry(
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

  private async withAgentSummaryUpdateLock<T>(
    agentId: AgentId,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${WorldManager.AGENT_SUMMARY_UPDATE_LOCK_PREFIX}${agentId}`;
    const lock = await this.lockService.acquireLock(
      lockKey,
      WorldManager.AGENT_SUMMARY_UPDATE_LOCK_TTL
    );
    if (!lock) {
      throw new Error(`Failed to lock agent summary update for ${agentId}`);
    }
    try {
      return await operation();
    } finally {
      await lock.release();
    }
  }

  private async withAgentMemoryUpdateLock<T>(
    agentId: AgentId,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${WorldManager.AGENT_MEMORY_UPDATE_LOCK_PREFIX}${agentId}`;
    const lock = await this.lockService.acquireLock(
      lockKey,
      WorldManager.AGENT_MEMORY_UPDATE_LOCK_TTL
    );
    if (!lock) {
      throw new Error(`Failed to lock agent memory update for ${agentId}`);
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
      llmApiKeyUserId?: UserId;
      preLoadLocation?: (locationModel: LocationModel) => Promise<void>;
    } = {}
  ): Promise<Location> {
    const apiKeys =
      options.llmApiKeyUserId &&
      (await this.userRepository.getUserLlmApiKeys(options.llmApiKeyUserId));

    const locationModel =
      await this.locationRepository.getLocationModel(locationId);
    const locationMeta = locationModel.meta as LocationMeta;

    const locationState =
      await this.locationRepository.getOrCreateLocationState(locationId);
    const locationMessages = await this.locationRepository.getLocationMessages(
      locationId,
      locationMeta.messageLimit
    );

    if (options.preLoadLocation) {
      await options.preLoadLocation(locationModel);
    }

    const location = new Location(locationModel, {
      state: locationState,
      messages: locationMessages,
      apiKeys,
    });

    let lastUserMessageAt: Map<UserId, Date> | undefined = undefined;
    let agentContextUserIds = location.state.userIds;
    if (agentContextUserIds.length > location.meta.agentUserContextLimit) {
      lastUserMessageAt = new Map();
      for (const message of location.messages) {
        if (message.entityType == EntityType.User) {
          lastUserMessageAt.set(
            message.entityId as UserId,
            new Date(message.createdAt)
          );
        }
      }
      if (lastUserMessageAt.size >= location.meta.agentUserContextLimit) {
        agentContextUserIds = Array.from(lastUserMessageAt.keys());
      } else {
        agentContextUserIds = [...agentContextUserIds];
      }
      agentContextUserIds.sort(
        (a, b) =>
          (lastUserMessageAt!.get(b)?.getTime() ?? Math.random()) -
          (lastUserMessageAt!.get(a)?.getTime() ?? Math.random())
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
        lastUserMessageAt = new Map();
        for (const message of location.messages) {
          if (message.entityType == EntityType.User) {
            lastUserMessageAt.set(
              message.entityId as UserId,
              new Date(message.createdAt)
            );
          }
        }
      }
      if (lastUserMessageAt.size >= location.meta.userContextLimit) {
        locationContextUserIds = Array.from(lastUserMessageAt.keys());
      } else {
        locationContextUserIds = [...locationContextUserIds];
      }
      locationContextUserIds.sort(
        (a, b) =>
          (lastUserMessageAt!.get(b)?.getTime() ?? Math.random()) -
          (lastUserMessageAt!.get(a)?.getTime() ?? Math.random())
      );
      locationContextUserIds = locationContextUserIds.slice(
        0,
        location.meta.userContextLimit
      );
    }
    const users = await this.getUsers(location, locationContextUserIds);

    const gimmicks = await this.getGimmicks(location);

    const items = await this.itemRepository.getEntityItemModels(
      Array.from(agents.keys()),
      Array.from(users.keys())
    );

    for (const gimmick of gimmicks.values()) {
      location.addEntity(gimmick, false);
    }

    for (const agent of agents.values()) {
      agent.setItems(items[agent.key] ?? []);
      location.addEntity(agent, false);
    }

    for (const user of users.values()) {
      user.setItems(items[user.key] ?? []);
      location.addEntity(user, false);
    }

    const entityStates =
      await this.locationRepository.getOrCreateLocationEntityStates(
        locationId,
        location.getAgentIds(),
        location.getUserIds(),
        location.getGimmickIds()
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
  ): Promise<Map<AgentId, Agent>> {
    const agentModels = await this.agentRepository.getAgentModels(agentIds);
    const agentStates =
      await this.agentRepository.getOrCreateAgentStates(agentIds);
    const agentEntityStates =
      await this.agentRepository.getOrCreateAgentEntityStates(
        agentIds,
        agentIds,
        userIds
      );

    const agents: Map<AgentId, Agent> = new Map();
    for (const [agentId, agentModel] of agentModels) {
      const agent = new Agent(location, agentModel, {
        state: agentStates.get(agentId),
      });

      const entityStates = agentEntityStates.get(agentId);
      if (entityStates) {
        for (const entityState of entityStates) {
          agent.addEntityState(entityState);
        }
      }

      agents.set(agentId, agent);
    }

    return agents;
  }

  private async getUsers(
    location: Location,
    userIds: UserId[]
  ): Promise<Map<UserId, User>> {
    const userModels = await this.userRepository.getUserModels(userIds);
    const userStates = await this.userRepository.getOrCreateUserStates(userIds);

    const users: Map<UserId, User> = new Map();
    for (const [userId, userModel] of userModels) {
      users.set(
        userId,
        new User(location, userModel, {
          state: userStates.get(userId),
        })
      );
    }

    return users;
  }

  private async getGimmicks(
    location: Location
  ): Promise<Map<GimmickId, Gimmick>> {
    const gimmickMetas = location.meta.gimmicks;
    const gimmickIds = Object.keys(gimmickMetas).map(
      (key) => Number(key) as GimmickId
    );
    const gimmickStates = await this.gimmickRepository.getOrCreateGimmickStates(
      location.id,
      gimmickIds
    );

    const gimmicks: Map<GimmickId, Gimmick> = new Map();
    for (const gimmickId of gimmickIds) {
      gimmicks.set(
        gimmickId,
        new Gimmick(location, gimmickId, gimmickMetas[gimmickId.toString()], {
          state: gimmickStates.get(gimmickId),
        })
      );
    }

    return gimmicks;
  }

  public async addLocationMessage(
    locationId: LocationId,
    message: LocationMessage
  ): Promise<void> {
    await this.locationRepository.addLocationMessage(locationId, message);
    await this.emitAsync('locationMessageAdded', locationId, message);
  }

  public async addLocationAgentMessage(
    locationId: LocationId,
    agentId: AgentId,
    name: string,
    message?: string,
    createdAt?: Date,
    options: {
      targetEntityType?: EntityType;
      targetEntityId?: EntityId;
      expression?: string;
      emotion?: string;
      image?: string;
    } = {}
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      locationId,
      entityType: EntityType.Agent,
      entityId: agentId,
      targetEntityType: options.targetEntityType,
      targetEntityId: options.targetEntityId,
      name,
      message,
      expression: options.expression,
      emotion: options.emotion,
      image: options.image,
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
    const locationMessages = await this.locationRepository.getLocationMessages(
      locationId,
      1
    );

    if (locationMessages.length === 0) {
      const message: LocationMessage = {
        locationId,
        entityType: EntityType.Agent,
        entityId: agentId,
        name,
        message: greeting,
        createdAt: createdAt ?? new Date(),
        updatedAt: new Date(),
      };

      await this.addLocationMessage(locationId, message);
    }
  }

  public async addLocationAgentActionMessage(
    locationId: LocationId,
    agentId: AgentId,
    name: string,
    action: string,
    createdAt?: Date,
    _options: {} = {}
  ): Promise<void> {
    const message: LocationMessage = {
      locationId,
      entityType: EntityType.Agent,
      entityId: agentId,
      name,
      action,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };

    await this.addLocationMessage(locationId, message);
  }

  public async addLocationUserMessage(
    locationId: LocationId,
    userId: UserId,
    name: string,
    message?: string,
    createdAt?: Date,
    options: {
      targetEntityType?: EntityType;
      targetEntityId?: EntityId;
      expression?: string;
      emotion?: string;
      image?: string;
    } = {}
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      locationId,
      entityType: EntityType.User,
      entityId: userId,
      targetEntityType: options?.targetEntityType,
      targetEntityId: options?.targetEntityId,
      name,
      message,
      expression: options.expression,
      emotion: options.emotion,
      image: options.image,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    await this.addLocationMessage(locationId, locationMessage);
  }

  public async addLocationSystemMessage(
    locationId: LocationId,
    message: string,
    createdAt?: Date,
    _options: {} = {}
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      locationId,
      entityType: EntityType.System,
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

    options.handleSave ??= async <T>(save: Promise<T>) => {
      await save;
    };

    const location = await this.getLocation(locationId, {
      llmApiKeyUserId,
      preLoadLocation: options.preLoadLocation,
    });
    if (location.getAgentCount() === 0) {
      console.log(`No agents in location ${locationId}, pausing update`);
      await this.locationRepository.updateLocationStatePauseUpdateUntil(
        locationId,
        null,
        LocationPauseReason.NO_AGENTS
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

    location.on(
      'messageAdded',
      (location: Location, message: LocationMessage) => {
        void options.handleSave!(this.addLocationMessage(location.id, message));
      }
    );

    location.on(
      'canvasUpdated',
      (
        location: Location,
        modifierEntityType: EntityType,
        modifierEntityId: EntityId,
        canvasName: string,
        text: string
      ) => {
        void options.handleSave!(
          this.locationRepository.updateLocationStateCanvas(
            location.id,
            canvasName,
            modifierEntityType,
            modifierEntityId,
            text
          )
        );
      }
    );

    location.on(
      'canvasEdited',
      (
        location: Location,
        modifierEntityType: EntityType,
        modifierEntityId: EntityId,
        canvasName: string,
        existingContent: string,
        newContent: string,
        text: string
      ) => {
        void options.handleSave!(
          this.locationRepository.updateLocationStateCanvas(
            location.id,
            canvasName,
            modifierEntityType,
            modifierEntityId,
            text
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
      'agentExecutedNextActions',
      (agent: Agent, messages: LlmMessage[], toolCalls: LlmToolCall[]) => {
        void options.handleSave!(
          Promise.all([
            this.updateAgentSummary(agent, messages, toolCalls),
            this.updateAgentMemory(agent, messages, toolCalls),
          ])
        );
      }
    );

    location.on(
      'gimmickOccupied',
      (gimmick: Gimmick, entity: Entity, occupationUntil?: Date) => {
        void options.handleSave!(
          this.gimmickRepository.updateGimmickStateOccupier(
            locationId,
            gimmick.id,
            entity.type,
            entity.id,
            occupationUntil
          )
        );
      }
    );

    location.on('gimmickReleased', (gimmick: Gimmick) => {
      void options.handleSave!(
        this.gimmickRepository.updateGimmickStateOccupier(
          locationId,
          gimmick.id
        )
      );
    });

    async function handleGimmickExecuting(
      gimmick: Gimmick,
      entity: Entity,
      parameters: GimmickParameters,
      promise: Promise<boolean>
    ): Promise<void> {
      try {
        await promise;
      } catch (error) {
        console.error(error);
        await gimmick.location.emitAsync(
          'gimmickExecutionFailed',
          gimmick,
          entity,
          parameters
        );

        let errorMessage;
        if (error instanceof Error) {
          errorMessage = error.message;
        } else {
          errorMessage = 'Unknown error';
        }
        await gimmick.location.addSystemMessage(
          `${entity.type} ${entity.name} failed to execute ${gimmick.key}: ${errorMessage}`
        );
      }
    }
    location.on(
      'gimmickExecuting',
      (
        gimmick: Gimmick,
        entity: Entity,
        parameters: GimmickParameters,
        promise: Promise<boolean>
      ) => {
        void options.handleSave!(
          handleGimmickExecuting(gimmick, entity, parameters, promise)
        );
      }
    );

    location.on(
      'gimmickExecutionFailed',
      (gimmick: Gimmick, _entity: Entity, _parameters: GimmickParameters) => {
        void options.handleSave!(gimmick.release());
        void options.handleSave!(
          this.updateLocation(llmApiKeyUserId, locationId, {
            ...options,
            ignorePauseUpdateUntil: true,
            executeSpecificAgentId: _entity.id as AgentId,
          })
        );
      }
    );

    location.on('gimmickExecuted', async (gimmick: Gimmick, entity: Entity) => {
      await gimmick.release();
      if (entity.type === EntityType.Agent) {
        if (ENV.DEBUG) {
          console.log(
            `Force updating location ${locationId} with agent ${entity.id} for gimmick ${gimmick.id}`
          );
        }
        void options.handleSave!(
          this.updateLocation(llmApiKeyUserId, locationId, {
            ...options,
            ignorePauseUpdateUntil: true,
            executeSpecificAgentId: entity.id as AgentId,
          })
        );
      }
    });

    location.on(
      'entityAddItem',
      async (
        entity: Entity,
        dataId: ItemDataId,
        count: number,
        stackable: boolean,
        reason?: string
      ) => {
        if (stackable) {
          await options.handleSave!(
            this.itemRepository.addOrCreateItemModel(
              entity.key,
              dataId,
              count,
              reason
            )
          );
        } else {
          await Promise.all(
            Array.from({ length: count }, async () => {
              await options.handleSave!(
                this.itemRepository.addOrCreateItemModel(
                  entity.key,
                  dataId,
                  1,
                  reason
                )
              );
            })
          );
        }
      }
    );

    location.on(
      'entityRemoveItem',
      async (
        entity: Entity,
        item: ItemModel,
        count: number,
        reason?: string
      ) => {
        await options.handleSave!(
          this.itemRepository.removeItemModel(entity.key, item, count, reason)
        );
      }
    );

    location.on(
      'entityTransferItem',
      async (
        entity: Entity,
        item: ItemModel,
        count: number,
        targetEntityKey: EntityKey,
        reason?: string
      ) => {
        await options.handleSave!(
          this.itemRepository.transferItemModel(
            entity.key,
            item,
            targetEntityKey,
            count,
            reason
          )
        );
      }
    );

    location.on(
      'entityUpdateCanvas',
      (entity: Entity, canvasName: string, text: string) => {
        void options.handleSave!(
          this.locationRepository.updateLocationEntityStateCanvas(
            locationId,
            entity.type,
            entity.id,
            canvasName,
            text
          )
        );
      }
    );

    let pauseUpdateDuration;
    try {
      if (options.executeSpecificAgentId) {
        await location.init();
        await location
          .getAgent(options.executeSpecificAgentId as AgentId)!
          .executeNextActions();
        pauseUpdateDuration = location.core.defaultPauseUpdateDuration;
      } else {
        pauseUpdateDuration = await location.update();
      }
    } catch (error) {
      await this.locationRepository.updateLocationStatePauseUpdateUntil(
        locationId,
        null,
        LocationPauseReason.UPDATE_ERROR
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
        pauseUpdateUntil,
        LocationPauseReason.SCHEDULED_PAUSE
      );
    } else {
      if (ENV.DEBUG) {
        console.log(`Location ${location.model.name} paused update`);
      }
      await this.locationRepository.updateLocationStatePauseUpdateUntil(
        locationId,
        null,
        LocationPauseReason.UPDATE_COMPLETED
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

  public async updateAgentSummary(
    agent: Agent,
    messages: LlmMessage[],
    toolCalls: LlmToolCall[]
  ): Promise<void> {
    return await this.withAgentSummaryUpdateLock(agent.id, async () => {
      const agentState = await this.agentRepository.getOrCreateAgentState(
        agent.id
      );
      agent.state = agentState;
      const summary = await agent.generateSummary(messages, toolCalls);

      await this.agentRepository.updateAgentStateSummary(
        agent.id,
        summary.slice(0, agent.meta.summaryLengthLimit)
      );

      if (ENV.DEBUG) {
        console.log(`Agent ${agent.name} summary updated to ${summary}`);
      }
    });
  }

  public async updateAgentMemory(
    agent: Agent,
    messages: LlmMessage[],
    toolCalls: LlmToolCall[]
  ): Promise<void> {
    return await this.withAgentMemoryUpdateLock(agent.id, async () => {
      const agentState = await this.agentRepository.getOrCreateAgentState(
        agent.id
      );
      agent.state = agentState;
      return await agent.executeMemoryActions(messages, toolCalls);
    });
  }
}
