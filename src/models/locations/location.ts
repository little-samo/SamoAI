import { AsyncEventEmitter, ENV } from '@little-samo/samo-ai/common';

import {
  Agent,
  AgentId,
  Entity,
  EntityId,
  EntityType,
  EntityKey,
  User,
  UserId,
} from '../entities';
import { LlmApiKeyModel } from '../llms';

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
import { LocationModel } from './location.model';

export class Location extends AsyncEventEmitter {
  public static messageToContext(
    message: LocationMessage
  ): LocationMessageContext {
    return new LocationMessageContext({
      key:
        message.entityType === EntityType.SYSTEM
          ? ('system' as EntityKey)
          : (`${message.entityType}:${message.entityId}` as EntityKey),
      targetKey: message.targetEntityType
        ? (`${message.targetEntityType}:${message.targetEntityId}` as EntityKey)
        : undefined,
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
    options: {
      state?: null | LocationState;
      messagesState?: null | LocationMessagesState;
      apiKeys?: LlmApiKeyModel[];
      defaultMeta?: LocationMeta;
    } = {}
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

  public async addMessage(message: LocationMessage): Promise<void> {
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

    await this.emitAsync('messageAdded', message);
  }

  public async addAgentMessage(
    agent: Agent,
    message?: string,
    expression?: string
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      entityType: EntityType.AGENT,
      entityId: agent.model.id as AgentId,
      name: agent.name,
      message: message?.substring(0, this.meta.messageLengthLimit),
      expression: expression?.substring(0, this.meta.messageLengthLimit),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.addMessage(locationMessage);
  }

  public async addUserMessage(
    user: User,
    message?: string,
    expression?: string
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      entityType: EntityType.USER,
      entityId: user.model.id as UserId,
      name: user.name,
      message: message?.substring(0, this.meta.messageLengthLimit),
      expression: expression?.substring(0, this.meta.messageLengthLimit),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.addMessage(locationMessage);
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
