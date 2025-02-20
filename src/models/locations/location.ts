import { EventEmitter } from 'events';

import { LlmApiKeyModel, LocationModel } from '@prisma/client';
import { Agent } from '@little-samo/samo-ai/models/entities/agents/agent';
import { User } from '@little-samo/samo-ai/models/entities/users/user';
import { Entity } from '@little-samo/samo-ai/models/entities/entity';
import { AgentState } from '@little-samo/samo-ai/models/entities/agents/states/agent.state';
import { AgentEntityState } from '@little-samo/samo-ai/models/entities/agents/states/agent.entity-state';
import { ENV } from '@little-samo/samo-ai/common/config';
import {
  AgentId,
  EntityId,
  EntityKey,
  EntityType,
  UserId,
} from '@little-samo/samo-ai/models/entities/entity.types';

import {
  LocationMessage,
  LocationMessagesState,
} from './states/location.messages-state';
import { LocationState } from './states/location.state';
import { DEFAULT_LOCATION_META, LocationMeta } from './location.meta';
import { LocationCore } from './cores/location.core';
import { LocationContext, LocationMessageContext } from './location.context';
import { LocationCoreFactory } from './cores';
import { LocationEntityState } from './states/location.entity-state';
import { LocationId, LocationKey } from './location.type';

export interface LocationConstructorOptions {
  state?: null | LocationState;
  messagesState?: null | LocationMessagesState;
  apiKeys?: LlmApiKeyModel[];
  defaultMeta?: LocationMeta;
}

export type LocationAgentExecuteNextActionsHook = (
  location: Location,
  agent: Agent
) => Promise<void>;

export type LocationAgentMessageHook = (
  location: Location,
  agent: Agent,
  message?: string,
  expression?: string
) => Promise<void>;

export type LocationAgentMemoryHook = (
  location: Location,
  agent: Agent,
  state: AgentState,
  index: number,
  memory: string
) => Promise<void>;

export type LocationAgentEntityMemoryHook = (
  location: Location,
  agent: Agent,
  state: AgentEntityState,
  index: number,
  memory: string
) => Promise<void>;

export type LocationAgentExpressionHook = (
  location: Location,
  agent: Agent,
  state: LocationEntityState,
  expression: string
) => Promise<void>;

export class Location extends EventEmitter {
  public static messageToContext(
    message: LocationMessage
  ): LocationMessageContext {
    return new LocationMessageContext({
      key: message.agentId
        ? (`agent:${message.agentId}` as EntityKey)
        : message.userId
          ? (`user:${message.userId}` as EntityKey)
          : ('system' as EntityKey),
      name: message.name,
      message: message.message,
      expression: message.expression,
      created: Math.floor(new Date(message.createdAt).getTime() / 1000),
    });
  }

  public readonly id: LocationId;
  public readonly key: LocationKey;

  public meta: LocationMeta;

  public core: LocationCore;

  public readonly entities: Record<EntityKey, Entity> = {};
  public readonly agents: Record<number, Agent> = {};
  public readonly users: Record<number, User> = {};

  public readonly state: LocationState;
  public readonly messagesState: LocationMessagesState;

  public readonly apiKeys: Record<string, LlmApiKeyModel> = {};

  private agentExecuteNextActionsPreHooks: LocationAgentExecuteNextActionsHook[] =
    [];
  private agentMessageHooks: LocationAgentMessageHook[] = [];
  private agentMemoryHooks: LocationAgentMemoryHook[] = [];
  private agentEntityMemoryHooks: LocationAgentEntityMemoryHook[] = [];
  private agentExpressionHooks: LocationAgentExpressionHook[] = [];

  private readonly _entityStates: Record<EntityKey, LocationEntityState> = {};

  public static createState(
    model: LocationModel,
    _meta: LocationMeta
  ): LocationState {
    const state: LocationState = {
      locationId: model.id as LocationId,
      agentIds: [],
      userIds: [],
      pauseUpdateUntil: null,
      updatedAt: new Date(),
      createdAt: new Date(),
      dirty: true,
    };
    return state;
  }

  public static fixState(_state: LocationState, _meta: LocationMeta): void {}

  public static createMessagesState(
    model: LocationModel,
    _meta: LocationMeta
  ): LocationMessagesState {
    const state: LocationMessagesState = {
      locationId: model.id as LocationId,
      messages: [],
      updatedAt: new Date(),
      createdAt: new Date(),
      dirty: true,
    };
    return state;
  }

  public static fixMessagesState(
    _state: LocationMessagesState,
    _meta: LocationMeta
  ): void {
    if (_state.messages.length > _meta.messageLimit) {
      _state.messages = _state.messages.slice(
        _state.messages.length - _meta.messageLimit
      );
      _state.dirty = true;
    }
  }

  public constructor(
    public readonly model: LocationModel,
    options: LocationConstructorOptions = {}
  ) {
    super();
    this.id = model.id as LocationId;
    this.key = `location:${model.id}` as LocationKey;
    this.meta = {
      ...DEFAULT_LOCATION_META,
      ...(options.defaultMeta ?? {}),
      ...(model.meta as object),
    };

    const { state, messagesState, apiKeys } = options;

    const initialState = state ?? Location.createState(model, this.meta);
    Location.fixState(initialState, this.meta);
    this.state = initialState;

    const initialMessagesState =
      messagesState ?? Location.createMessagesState(model, this.meta);
    Location.fixMessagesState(initialMessagesState, this.meta);
    this.messagesState = initialMessagesState;

    this.core = LocationCoreFactory.createCore(this);

    if (apiKeys) {
      for (const apiKey of apiKeys) {
        this.apiKeys[apiKey.platform] = apiKey;
      }
    }
  }

  public addEntity(entity: Entity, updateIds: boolean = true): void {
    this.entities[entity.key] = entity;
    if (entity instanceof Agent) {
      this.agents[entity.model.id] = entity;
    } else if (entity instanceof User) {
      this.users[entity.model.id] = entity;
    }
    if (updateIds) {
      if (entity instanceof Agent) {
        this.state.agentIds.push(entity.model.id as AgentId);
      } else if (entity instanceof User) {
        this.state.userIds.push(entity.model.id as UserId);
      }
      this.state.dirty = true;
    }
  }

  public removeEntity(entity: Entity, updateIds: boolean = true): void {
    delete this.entities[entity.key];
    if (entity instanceof Agent) {
      delete this.agents[entity.model.id];
    } else if (entity instanceof User) {
      delete this.users[entity.model.id];
    }
    if (updateIds) {
      if (entity instanceof Agent) {
        this.state.agentIds = this.state.agentIds.filter(
          (id) => id !== entity.model.id
        );
      } else if (entity instanceof User) {
        this.state.userIds = this.state.userIds.filter(
          (id) => id !== entity.model.id
        );
      }
      this.state.dirty = true;
    }
  }

  public createEntityState(
    type: EntityType,
    id: EntityId
  ): LocationEntityState {
    const state: LocationEntityState = {
      locationId: this.id,
      targetType: type,
      targetId: id,
      isActive: null,
      expression: null,
      updatedAt: new Date(),
      createdAt: new Date(),
    };
    return state;
  }

  public fixEntityState(_state: LocationEntityState): void {}

  public getEntityState(key: EntityKey): LocationEntityState | undefined {
    return this._entityStates[key];
  }

  public getOrCreateEntityState(
    type: EntityType,
    id: EntityId
  ): LocationEntityState {
    const key = `${type}:${id}` as EntityKey;
    const state = this._entityStates[key];
    if (state) {
      return state;
    }
    const newState = this.createEntityState(type, id);
    this._entityStates[key] = newState;
    return newState;
  }

  public getOrCreateEntityStateByTarget(target: Entity): LocationEntityState {
    return this.getOrCreateEntityState(target.type, target.id);
  }

  public addEntityState(state: LocationEntityState): LocationEntityState {
    const key: EntityKey = `${state.targetType}:${state.targetId}` as EntityKey;

    this.fixEntityState(state);
    this._entityStates[key] = state;

    return state;
  }

  public removeEntityStateByTarget(target: Entity): void {
    const key = target.key;
    delete this._entityStates[key];
  }

  public get context(): LocationContext {
    return new LocationContext({
      key: this.key,
      description: this.meta.description,
      messages: this.messagesState.messages.map(Location.messageToContext),
    });
  }

  public get lastMessageContext(): LocationMessageContext | undefined {
    const lastMessage = this.messagesState.messages.at(-1);
    return lastMessage ? Location.messageToContext(lastMessage) : undefined;
  }

  public getEntityStates(): LocationEntityState[] {
    return Object.values(this._entityStates);
  }

  public reloadCore(): void {
    if (this.core.name === this.meta.core) {
      return;
    }
    this.core = LocationCoreFactory.createCore(this);
  }

  public addMessage(message: LocationMessage): void {
    if (message.expression) {
      message.expression = message.expression.substring(
        0,
        this.meta.messageLengthLimit
      );
    }
    if (message.message) {
      message.message = message.message.substring(
        0,
        this.meta.messageLengthLimit
      );
    }
    if (!message.createdAt) {
      message.createdAt = new Date();
    }
    message.updatedAt = new Date();
    this.messagesState.messages.push(message);
    this.messagesState.messages.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    if (this.messagesState.messages.length > this.meta.messageLimit) {
      this.messagesState.messages.shift();
    }
    this.messagesState.dirty = true;
  }

  public addAgentExecuteNextActionsPreHook(
    hook: LocationAgentExecuteNextActionsHook
  ): void {
    this.agentExecuteNextActionsPreHooks.push(hook);
  }

  public addAgentMessageHook(hook: LocationAgentMessageHook): void {
    this.agentMessageHooks.push(hook);
  }

  public addAgentMemoryHook(hook: LocationAgentMemoryHook): void {
    this.agentMemoryHooks.push(hook);
  }

  public addAgentEntityMemoryHook(hook: LocationAgentEntityMemoryHook): void {
    this.agentEntityMemoryHooks.push(hook);
  }

  public addAgentExpressionHook(hook: LocationAgentExpressionHook): void {
    this.agentExpressionHooks.push(hook);
  }

  public async executeAgentExecuteNextActionsPreHooks(
    agent: Agent
  ): Promise<void> {
    await Promise.all(
      this.agentExecuteNextActionsPreHooks.map((hook) => hook(this, agent))
    );
  }

  public async executeAgentMessageHooks(
    agent: Agent,
    message?: string,
    expression?: string
  ): Promise<void> {
    try {
      await Promise.all(
        this.agentMessageHooks.map((hook) =>
          hook(this, agent, message, expression)
        )
      );
    } catch (error: unknown) {
      throw new Error(
        `Message hook failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  public async executeAgentMemoryHooks(
    agent: Agent,
    state: AgentState,
    index: number,
    memory: string
  ): Promise<void> {
    try {
      await Promise.all(
        this.agentMemoryHooks.map((hook) =>
          hook(this, agent, state, index, memory)
        )
      );
    } catch (error: unknown) {
      throw new Error(
        `Memory hook failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  public async executeAgentEntityMemoryHooks(
    agent: Agent,
    state: AgentEntityState,
    index: number,
    memory: string
  ): Promise<void> {
    try {
      await Promise.all(
        this.agentEntityMemoryHooks.map((hook) =>
          hook(this, agent, state, index, memory)
        )
      );
    } catch (error: unknown) {
      throw new Error(
        `Entity memory hook failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  public async executeAgentExpressionHooks(
    agent: Agent,
    state: LocationEntityState,
    expression: string
  ): Promise<void> {
    try {
      await Promise.all(
        this.agentExpressionHooks.map((hook) =>
          hook(this, agent, state, expression)
        )
      );
    } catch (error: unknown) {
      throw new Error(
        `Expression hook failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  public async addAgentMessage(
    agent: Agent,
    message?: string,
    expression?: string
  ): Promise<void> {
    this.emit('agentMessage', agent, message, expression);
    await this.executeAgentMessageHooks(agent, message, expression);

    const locationMessage: LocationMessage = {
      agentId: agent.model.id as AgentId,
      name: agent.name,
      message: message?.substring(0, this.meta.messageLengthLimit),
      expression: expression?.substring(0, this.meta.messageLengthLimit),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.addMessage(locationMessage);
  }

  public addUserMessage(
    user: User,
    message?: string,
    expression?: string
  ): void {
    this.emit('userMessage', user, message, expression);

    const locationMessage: LocationMessage = {
      userId: user.model.id as UserId,
      name: user.name,
      message: message?.substring(0, this.meta.messageLengthLimit),
      expression: expression?.substring(0, this.meta.messageLengthLimit),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.addMessage(locationMessage);
  }

  public async update(): Promise<number> {
    this.reloadCore();
    if (ENV.DEBUG) {
      console.log(
        `Updating location ${this.model.name}, core: ${this.core.constructor.name}`
      );
    }
    return await this.core.update();
  }
}
