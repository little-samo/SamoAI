import { AsyncEventEmitter, ENV } from '@little-samo/samo-ai/common';

import {
  Agent,
  AgentId,
  Entity,
  EntityType,
  EntityKey,
  User,
  UserId,
  EntityId,
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
        message.entityType === EntityType.System
          ? ('system' as EntityKey)
          : (`${message.entityType}:${message.entityId}` as EntityKey),
      targetKey: message.targetEntityType
        ? (`${message.targetEntityType}:${message.targetEntityId}` as EntityKey)
        : undefined,
      name: message.name,
      message: message.message,
      expression: message.expression,
      action: message.action,
      image: message.image,
      created: message.createdAt,
    });
  }

  public readonly id: LocationId;
  public readonly key: LocationKey;

  public meta: LocationMeta;

  public core!: LocationCore;

  public readonly entities: Record<EntityKey, Entity> = {};
  public readonly agents: Record<AgentId, Agent> = {};
  public readonly users: Record<UserId, User> = {};

  public readonly state: LocationState;
  public readonly messagesState: LocationMessagesState;

  public readonly apiKeys: Record<string, LlmApiKeyModel> = {};

  private readonly _entityStates: Record<EntityKey, LocationEntityState> = {};

  public static fixState(_state: LocationState, _meta: LocationMeta): void {}

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
      state: LocationState;
      messagesState: LocationMessagesState;
      apiKeys?: LlmApiKeyModel[];
      defaultMeta?: LocationMeta;
    }
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

    Location.fixState(state, this.meta);
    this.state = state;

    Location.fixMessagesState(messagesState, this.meta);
    this.messagesState = messagesState;

    this.reloadCore();

    if (apiKeys) {
      for (const apiKey of apiKeys) {
        this.apiKeys[apiKey.platform] = apiKey;
      }
    }
  }

  public addEntity(entity: Entity, updateIds: boolean = true): void {
    this.entities[entity.key] = entity;
    if (entity instanceof Agent) {
      this.agents[entity.model.id as AgentId] = entity;
    } else if (entity instanceof User) {
      this.users[entity.model.id as UserId] = entity;
    }
    if (updateIds) {
      if (entity instanceof Agent) {
        this.state.agentIds.push(entity.model.id as AgentId);
      } else if (entity instanceof User) {
        this.state.userIds.push(entity.model.id as UserId);
      }
    }
  }

  public removeEntity(entity: Entity, updateIds: boolean = true): void {
    delete this.entities[entity.key];
    if (entity instanceof Agent) {
      delete this.agents[entity.model.id as AgentId];
    } else if (entity instanceof User) {
      delete this.users[entity.model.id as UserId];
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
    }
  }

  public fixEntityState(_state: LocationEntityState): void {}

  public getEntityState(key: EntityKey): LocationEntityState | undefined {
    return this._entityStates[key];
  }

  public getEntityStateByTarget(target: Entity): LocationEntityState {
    const key = `${target.type}:${target.id}` as EntityKey;
    return this._entityStates[key];
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
    if (this.core && this.core.name === this.meta.core) {
      return;
    }
    this.core = LocationCoreFactory.createCore(this);
  }

  public async addMessage(message: LocationMessage): Promise<void> {
    let messageLengthLimit: number;
    switch (message.entityType) {
      case EntityType.Agent:
        messageLengthLimit =
          this.meta.agentMessageLengthLimit ?? this.meta.messageLengthLimit;
        break;
      default:
        messageLengthLimit = this.meta.messageLengthLimit;
    }

    if (message.expression) {
      message.expression = message.expression.substring(0, messageLengthLimit);
    }
    if (message.message) {
      message.message = message.message.substring(0, messageLengthLimit);
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

    await this.emitAsync('messageAdded', this, message);
  }

  public async addAgentMessage(
    agent: Agent,
    options: {
      message?: string;
      expression?: string;
      action?: string;
      emotion?: string;
      image?: string;
    } = {}
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      entityType: EntityType.Agent,
      entityId: agent.model.id as AgentId,
      name: agent.name,
      message: options.message,
      expression: options.expression,
      action: options.action,
      emotion: options.emotion,
      image: options.image,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.addMessage(locationMessage);
  }

  public async addUserMessage(
    user: User,
    options: {
      message?: string;
      expression?: string;
      image?: string;
    } = {}
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      entityType: EntityType.User,
      entityId: user.model.id as UserId,
      name: user.name,
      message: options.message,
      expression: options.expression,
      image: options.image,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.addMessage(locationMessage);
  }

  public async addSystemMessage(message: string): Promise<void> {
    const locationMessage: LocationMessage = {
      entityType: EntityType.System,
      entityId: 0 as EntityId,
      name: '[SYSTEM]',
      message: message,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.addMessage(locationMessage);
  }

  public async update(): Promise<number> {
    this.reloadCore();
    if (ENV.DEBUG) {
      console.log(
        `Updating location ${this.model.name}, core: ${this.core.constructor.name}, ${Object.keys(this.agents).length} agents, ${Object.keys(this.users).length} users`
      );
    }
    return await this.core.update();
  }
}
