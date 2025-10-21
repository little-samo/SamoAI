import {
  ENV,
  LlmMessage,
  LlmToolCall,
  sleep,
  truncateString,
} from '@little-samo/samo-ai/common';
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
  LocationState,
} from '@little-samo/samo-ai/models';

import {
  AgentRepository,
  GimmickRepository,
  ItemRepository,
  LocationRepository,
  UserRepository,
} from './repositories';
import { LockService, InMemoryLockService } from './services';

interface UpdateLocationOptions {
  ignorePauseUpdateUntil?: boolean;
  executeSpecificAgentId?: AgentId;
  useAgentStartTimeForMessages?: boolean;
  preLoadLocation?: (
    locationModel: LocationModel,
    locationState: LocationState
  ) => Promise<void>;
  preAction?: (location: Location) => Promise<void>;
  postAction?: (location: Location) => Promise<void>;
  handleSave?: <T = void>(save: Promise<T>) => Promise<void>;
}

export interface SamoAIOptions {
  lockService?: LockService;
  locationRepository: LocationRepository;
  agentRepository: AgentRepository;
  userRepository: UserRepository;
  gimmickRepository: GimmickRepository;
  itemRepository: ItemRepository;
}

export class SamoAI extends AsyncEventEmitter {
  private static readonly LOCATION_UPDATE_LOCK_TTL = 30000; // 30 seconds
  private static readonly LOCATION_UPDATE_LOCK_PREFIX = 'lock:location-update:';
  private static readonly AGENT_SUMMARY_UPDATE_LOCK_TTL = 15000; // 15 seconds
  private static readonly AGENT_SUMMARY_UPDATE_LOCK_PREFIX =
    'lock:agent-summary-update:';
  private static readonly AGENT_MEMORY_UPDATE_LOCK_TTL = 15000; // 15 seconds
  private static readonly AGENT_MEMORY_UPDATE_LOCK_PREFIX =
    'lock:agent-memory-update:';

  private static readonly GIMMICK_EXECUTION_FAILED_RESUME_UPDATE_DELAY = 1000; // 1 second
  private static readonly GIMMICK_EXECUTED_RESUME_UPDATE_DELAY = 1000; // 1 second

  private static _instance: SamoAI;

  public static initialize(options: SamoAIOptions) {
    SamoAI._instance = new SamoAI(options);
  }

  public static get instance() {
    if (!this._instance) {
      throw new Error('SamoAI not initialized');
    }
    return this._instance;
  }

  private readonly lockService: LockService;
  public readonly locationRepository: LocationRepository;
  public readonly agentRepository: AgentRepository;
  public readonly userRepository: UserRepository;
  public readonly gimmickRepository: GimmickRepository;
  public readonly itemRepository: ItemRepository;

  private constructor(options: SamoAIOptions) {
    super();
    this.lockService = options.lockService || new InMemoryLockService();
    this.locationRepository = options.locationRepository;
    this.agentRepository = options.agentRepository;
    this.userRepository = options.userRepository;
    this.gimmickRepository = options.gimmickRepository;
    this.itemRepository = options.itemRepository;
  }

  public async withLocationUpdateLock<T>(
    locationId: LocationId,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${SamoAI.LOCATION_UPDATE_LOCK_PREFIX}${locationId}`;
    const lock = await this.lockService.acquireLock(
      lockKey,
      SamoAI.LOCATION_UPDATE_LOCK_TTL
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

  public async withLocationUpdateLockNoRetry<T>(
    locationId: LocationId,
    operation: () => Promise<T>
  ): Promise<T | null> {
    const lockKey = `${SamoAI.LOCATION_UPDATE_LOCK_PREFIX}${locationId}`;
    const lock = await this.lockService.acquireLockNoRetry(
      lockKey,
      SamoAI.LOCATION_UPDATE_LOCK_TTL
    );
    if (!lock) {
      // if (ENV.DEBUG) {
      //   console.log(`Failed to lock location ${locationId} (no retry)`);
      // }
      return null;
    }
    try {
      return await operation();
    } finally {
      await lock.release();
    }
  }

  public async withAgentSummaryUpdateLock<T>(
    agentId: AgentId,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${SamoAI.AGENT_SUMMARY_UPDATE_LOCK_PREFIX}${agentId}`;
    const lock = await this.lockService.acquireLock(
      lockKey,
      SamoAI.AGENT_SUMMARY_UPDATE_LOCK_TTL
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

  public async withAgentMemoryUpdateLock<T>(
    agentId: AgentId,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${SamoAI.AGENT_MEMORY_UPDATE_LOCK_PREFIX}${agentId}`;
    const lock = await this.lockService.acquireLock(
      lockKey,
      SamoAI.AGENT_MEMORY_UPDATE_LOCK_TTL
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
      preLoadLocation?: (
        locationModel: LocationModel,
        locationState: LocationState
      ) => Promise<void>;
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
      await options.preLoadLocation(locationModel, locationState);
    }

    const location = new Location(locationModel, {
      state: locationState,
      messages: locationMessages,
      apiKeys,
    });

    let lastAgentMessageAt: Map<AgentId, Date> | undefined = undefined;
    let lastUserMessageAt: Map<UserId, Date> | undefined = undefined;

    let agentContextAgentIds = location.state.agentIds;
    if (agentContextAgentIds.length > location.meta.agentAgentContextLimit) {
      lastAgentMessageAt = new Map();
      for (const message of location.messages) {
        if (message.entityType == EntityType.Agent) {
          lastAgentMessageAt.set(
            message.entityId as AgentId,
            new Date(message.createdAt)
          );
        }
      }
      if (lastAgentMessageAt.size >= location.meta.agentAgentContextLimit) {
        agentContextAgentIds = Array.from(lastAgentMessageAt.keys());
      } else {
        agentContextAgentIds = [...agentContextAgentIds];
      }
      agentContextAgentIds.sort(
        (a, b) =>
          (lastAgentMessageAt!.get(b)?.getTime() ?? Math.random()) -
          (lastAgentMessageAt!.get(a)?.getTime() ?? Math.random())
      );
      agentContextAgentIds = agentContextAgentIds.slice(
        0,
        location.meta.agentAgentContextLimit
      );
    }

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
      agentContextAgentIds,
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
    contextAgentIds: AgentId[],
    contextUserIds: UserId[]
  ): Promise<Map<AgentId, Agent>> {
    const agentModels = await this.agentRepository.getAgentModels(agentIds, {
      locationModel: location.model,
    });
    const agentStates =
      await this.agentRepository.getOrCreateAgentStates(agentIds);
    const agentEntityStates =
      await this.agentRepository.getOrCreateAgentEntityStates(
        agentIds,
        contextAgentIds,
        contextUserIds
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
      isSensitiveImage?: boolean;
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
      isSensitiveImage: options.isSensitiveImage,
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
      isSensitiveImage?: boolean;
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
      isSensitiveImage: options.isSensitiveImage,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    await this.addLocationMessage(locationId, locationMessage);
  }

  public async addLocationUserAction(
    locationId: LocationId,
    userId: UserId,
    name: string,
    action: string,
    createdAt?: Date
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      locationId,
      entityType: EntityType.User,
      entityId: userId,
      name,
      action,
      createdAt: createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    await this.addLocationMessage(locationId, locationMessage);
  }

  public async addLocationSystemMessage(
    locationId: LocationId,
    message: string,
    createdAt?: Date,
    options: {
      name?: string;
      image?: string;
    } = {}
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      locationId,
      entityType: EntityType.System,
      entityId: 0 as EntityId,
      name: options.name ?? '[SYSTEM]',
      message,
      image: options.image,
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

    try {
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
        location.state.remainingAgentExecutions !== null &&
        location.state.remainingAgentExecutions <= 0
      ) {
        console.log(
          `No agent executions remaining in location ${locationId}, pausing update`
        );
        await this.locationRepository.updateLocationStatePauseUpdateUntil(
          locationId,
          null,
          LocationPauseReason.NO_AGENT_EXECUTIONS
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

      if (options.useAgentStartTimeForMessages !== undefined) {
        location.useAgentStartTimeForMessages =
          options.useAgentStartTimeForMessages;
      }

      if (options.preAction) {
        await options.preAction(location);
      }

      location.on(
        'messageAdded',
        async (location: Location, message: LocationMessage) => {
          await options.handleSave!(
            this.addLocationMessage(location.id, message)
          );
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
            this.updateAgentSummary(agent, messages, toolCalls)
          );
          void options.handleSave!(
            this.updateAgentMemory(agent, messages, toolCalls)
          );
          void options.handleSave!(
            this.locationRepository.updateLocationStateRemainingAgentExecutions(
              locationId,
              {
                remainingAgentExecutionsDelta: -1,
              }
            )
          );
        }
      );

      location.on(
        'gimmickOccupied',
        async (gimmick: Gimmick, entity: Entity, occupationUntil?: Date) => {
          await options.handleSave!(
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

      location.on(
        'gimmickReleased',
        async (gimmick: Gimmick, entity: Entity) => {
          await options.handleSave!(
            this.gimmickRepository.updateGimmickStateOccupier(
              locationId,
              gimmick.id,
              undefined,
              undefined,
              undefined,
              {
                currentOccupierType: entity.type,
                currentOccupierId: entity.id,
              }
            )
          );
        }
      );

      async function handleGimmickExecuting(
        gimmick: Gimmick,
        entity: Entity,
        parameters: GimmickParameters,
        promise: Promise<void>
      ): Promise<void> {
        let reOccupationInterval: NodeJS.Timeout | null = null;

        try {
          // Set up periodic re-occupation every 10 seconds
          reOccupationInterval = setInterval(async () => {
            try {
              await gimmick.occupy(
                entity,
                Gimmick.DEFAULT_OCCUPATION_DURATION,
                `Re-occupying during execution: ${gimmick.key}`
              );
            } catch (error) {
              console.warn(
                'Failed to re-occupy gimmick during execution:',
                error
              );
            }
          }, Gimmick.RE_OCCUPATION_INTERVAL);

          // Create timeout promise
          const timeoutPromise = (async () => {
            await sleep(Gimmick.MAX_EXECUTION_TIMEOUT);
            throw new Error(
              `Gimmick execution timeout after ${Gimmick.MAX_EXECUTION_TIMEOUT / 1000} seconds`
            );
          })();

          // Race between the actual promise and timeout
          await Promise.race([options.handleSave!(promise), timeoutPromise]);
        } catch (error) {
          console.error(error);

          let errorMessage;
          if (error instanceof Error) {
            errorMessage = error.message;
          } else {
            errorMessage = 'Unknown error';
          }

          await gimmick.location.addSystemMessage(
            `${entity.key} ${entity.name} failed to execute ${gimmick.key}: ${errorMessage}`
          );

          await gimmick.location.emitAsync(
            'gimmickExecutionFailed',
            gimmick,
            entity,
            parameters,
            errorMessage
          );
        } finally {
          // Clean up the re-occupation interval
          if (reOccupationInterval) {
            clearInterval(reOccupationInterval);
          }
        }
      }

      location.on(
        'gimmickExecuting',
        (
          gimmick: Gimmick,
          entity: Entity,
          parameters: GimmickParameters,
          promise: Promise<void>
        ) => {
          void options.handleSave!(
            handleGimmickExecuting(gimmick, entity, parameters, promise)
          );
        }
      );

      location.on(
        'gimmickExecutionFailed',
        async (
          gimmick: Gimmick,
          entity: Entity,
          _parameters: GimmickParameters,
          _errorMessage: string
        ) => {
          await gimmick.release(entity);
          if (entity.type === EntityType.Agent) {
            if (ENV.DEBUG) {
              console.log(
                `Force updating location ${locationId} with agent ${entity.id} for gimmick ${gimmick.id}`
              );
            }
            location.pauseUpdated = true;
            void options.handleSave!(
              this.withLocationUpdateLock(locationId, async () => {
                await this.locationRepository.updateLocationStatePauseUpdateUntil(
                  locationId,
                  new Date(
                    Date.now() +
                      (location.core.meta.interval ??
                        SamoAI.GIMMICK_EXECUTION_FAILED_RESUME_UPDATE_DELAY)
                  ),
                  LocationPauseReason.GIMMICK_EXECUTION_FAILED,
                  entity.id as AgentId
                );
              })
            );
          }
        }
      );

      location.on(
        'gimmickExecuted',
        async (gimmick: Gimmick, entity: Entity) => {
          await gimmick.release(entity);
          if (
            !gimmick.core.options.skipResumeAgent &&
            entity.type === EntityType.Agent
          ) {
            if (ENV.DEBUG) {
              console.log(
                `Force updating location ${locationId} with agent ${entity.id} for gimmick ${gimmick.id}`
              );
            }
            location.pauseUpdated = true;
            void options.handleSave!(
              this.withLocationUpdateLock(locationId, async () => {
                await this.locationRepository.updateLocationStatePauseUpdateUntil(
                  locationId,
                  new Date(
                    Date.now() +
                      (location.core.meta.interval ??
                        SamoAI.GIMMICK_EXECUTED_RESUME_UPDATE_DELAY)
                  ),
                  LocationPauseReason.GIMMICK_EXECUTED,
                  entity.id as AgentId
                );
              })
            );
          }
        }
      );

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
                {
                  reason,
                }
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
                    {
                      reason,
                    }
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
            this.itemRepository.removeItemModel(entity.key, item, count, {
              reason,
            })
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
              {
                reason,
              }
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
      const nextAgentId =
        options.executeSpecificAgentId ?? location.state.pauseUpdateNextAgentId;
      const nextAgent = nextAgentId ? location.getAgent(nextAgentId) : null;

      if (ENV.DEBUG && nextAgentId && !nextAgent) {
        console.log(
          `Next agent ${nextAgentId} not found in location ${location.model.name}`
        );
      }

      if (nextAgent) {
        await location.init();
        await nextAgent.executeNextActions();
        pauseUpdateDuration = location.core.defaultPauseUpdateDuration;
      } else {
        pauseUpdateDuration = await location.update();
      }

      if (!location.pauseUpdated) {
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
      }

      if (options.postAction) {
        await options.postAction(location);
      }

      return location;
    } catch (error) {
      await this.locationRepository.updateLocationStatePauseUpdateUntil(
        locationId,
        null,
        LocationPauseReason.UPDATE_ERROR
      );
      throw error;
    }
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
    if (agent.meta.disableSummary) {
      return;
    }

    return await this.withAgentSummaryUpdateLock(agent.id, async () => {
      const agentState = await this.agentRepository.getOrCreateAgentState(
        agent.id
      );
      agent.state = agentState;
      const summary = await agent.generateSummary(messages, toolCalls);
      const { text: truncatedSummary } = truncateString(
        summary,
        agent.meta.summaryLengthLimit
      );

      await this.agentRepository.updateAgentStateSummary(
        agent.id,
        truncatedSummary
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
    if (agent.meta.disableMemory) {
      return;
    }

    if (!agent.meta.memoryPostActions) {
      return;
    }

    return await this.withAgentMemoryUpdateLock(agent.id, async () => {
      const agentState = await this.agentRepository.getOrCreateAgentState(
        agent.id
      );
      agent.state = agentState;
      return await agent.executeMemoryActions(messages, toolCalls);
    });
  }
}
