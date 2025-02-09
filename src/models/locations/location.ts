import { EventEmitter } from 'events';

import { LlmApiKeyModel, LocationModel } from '@prisma/client';
import { Agent } from '@models/entities/agents/agent';
import { User } from '@models/entities/users/user';
import { Entity, EntityKey } from '@models/entities/entity';

import {
  LocationMessage,
  LocationMessagesState,
} from './states/location.messages-state';
import { LocationState } from './states/location.state';
import { DEFAULT_LOCATION_META, LocationMeta } from './location.meta';
import { LocationCore } from './cores/location.core';
import { LocationContext } from './location.context';
import { LocationCoreFactory } from './cores/location.core-factory';

export type LocationId = number & { __locationId: true };

export type LocationKey = string & { __locationKey: true };

export class Location extends EventEmitter {
  public readonly id: LocationId;
  public readonly key: LocationKey;

  public readonly meta: LocationMeta;

  public readonly core: LocationCore;

  public readonly entities: Record<EntityKey, Entity> = {};
  public readonly agents: Record<number, Agent> = {};
  public readonly users: Record<number, User> = {};

  public readonly state: LocationState;
  public readonly messagesState: LocationMessagesState;

  public readonly apiKeys: Record<string, LlmApiKeyModel> = {};

  public static createState(
    model: LocationModel,
    _meta: LocationMeta
  ): LocationState {
    const state = new LocationState();
    state.locationId = model.id;
    state.agentIds = [];
    state.userIds = [];
    state.dirty = true;
    return state;
  }

  public static fixState(_state: LocationState, _meta: LocationMeta): void {}

  public static createMessagesState(
    model: LocationModel,
    _meta: LocationMeta
  ): LocationMessagesState {
    const state = new LocationMessagesState();
    state.locationId = model.id;
    state.messages = [];
    state.dirty = true;
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
    state?: null | LocationState,
    messagesState?: null | LocationMessagesState,
    apiKeys?: LlmApiKeyModel[]
  ) {
    super();
    this.id = model.id as LocationId;
    this.key = `location:${model.id}` as LocationKey;
    this.meta = { ...DEFAULT_LOCATION_META, ...(model.meta as object) };

    state ??= Location.createState(model, this.meta);
    Location.fixState(state, this.meta);
    this.state = state;

    messagesState ??= Location.createMessagesState(model, this.meta);
    Location.fixMessagesState(messagesState, this.meta);
    this.messagesState = messagesState;

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
        this.state.agentIds.push(entity.model.id);
      } else if (entity instanceof User) {
        this.state.userIds.push(entity.model.id);
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

  public get context(): LocationContext {
    return {
      name: this.model.name,
      description: this.meta.description,
      messages: this.messagesState.messages.map((message) => ({
        key: message.agentId
          ? (`agent:${message.agentId}` as EntityKey)
          : (`user:${message.userId}` as EntityKey),
        name: message.name,
        message: message.message,
        expression: message.expression,
        createdAt: message.createdAt,
      })),
    };
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
    this.messagesState.messages.push(message);
    if (this.messagesState.messages.length > this.meta.messageLimit) {
      this.messagesState.messages.shift();
    }
    this.messagesState.dirty = true;
  }

  public addAgentMessage(
    agent: Agent,
    message?: string,
    expression?: string
  ): void {
    const locationMessage = new LocationMessage();
    locationMessage.name = agent.name;
    if (message) {
      locationMessage.message = message.substring(
        0,
        this.meta.messageLengthLimit
      );
    }
    if (expression) {
      locationMessage.expression = expression.substring(
        0,
        this.meta.messageLengthLimit
      );
    }
    this.addMessage(locationMessage);
  }

  public addUserMessage(
    user: User,
    message?: string,
    expression?: string
  ): void {
    const locationMessage = new LocationMessage();
    locationMessage.name = user.name;
    if (message) {
      locationMessage.message = message.substring(
        0,
        this.meta.messageLengthLimit
      );
    }
    if (expression) {
      locationMessage.expression = expression.substring(
        0,
        this.meta.messageLengthLimit
      );
    }
    this.addMessage(locationMessage);
  }

  public async update(): Promise<void> {
    await this.core.update();
  }
}
