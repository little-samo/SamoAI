import { AsyncEventEmitter, ENV } from '@little-samo/samo-ai/common';
import { isEqual } from 'lodash';

import {
  Agent,
  AgentId,
  Entity,
  EntityType,
  EntityKey,
  User,
  UserId,
  EntityId,
  Gimmick,
  GimmickId,
} from '../entities';
import { LlmApiKeyModel } from '../llms';

import { LocationCoreFactory } from './cores';
import { LocationCore } from './cores/location.core';
import {
  LocationCanvasContext,
  LocationContext,
  LocationMessageContext,
} from './location.context';
import { DEFAULT_LOCATION_META, LocationMeta } from './location.meta';
import { LocationModel } from './location.model';
import { LocationId, LocationKey } from './location.type';
import { LocationEntityState } from './states/location.entity-state';
import {
  LocationMessage,
  LocationMessagesState,
} from './states/location.messages-state';
import { LocationState } from './states/location.state';

export class Location extends AsyncEventEmitter {
  public static messageToContext(
    message: LocationMessage
  ): LocationMessageContext {
    return new LocationMessageContext({
      key:
        message.entityType === EntityType.System
          ? (EntityType.System as EntityKey)
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

  private _meta!: LocationMeta;

  public core!: LocationCore;

  public readonly entities: Record<EntityKey, Entity> = {};
  public readonly agents: Record<AgentId, Agent> = {};
  public readonly users: Record<UserId, User> = {};
  public readonly gimmicks: Record<GimmickId, Gimmick> = {};

  public readonly state: LocationState;
  public readonly messagesState: LocationMessagesState;

  public readonly apiKeys: Record<string, LlmApiKeyModel> = {};

  private readonly _entityStates: Record<EntityKey, LocationEntityState> = {};

  public static fixState(state: LocationState, meta: LocationMeta): void {
    for (const canvas of meta.canvases) {
      if (!state.canvases[canvas.name]) {
        state.canvases[canvas.name] = {
          lastModifierEntityType: EntityType.System,
          lastModifierEntityId: 0 as EntityId,
          text: '',
          updatedAt: new Date(),
          createdAt: new Date(),
        };
      }
    }

    for (const name of Object.keys(state.canvases)) {
      if (!meta.canvases.some((c) => c.name === name)) {
        delete state.canvases[name];
      }
    }
  }

  public static fixMessagesState(
    _state: LocationMessagesState,
    _meta: LocationMeta
  ): void {
    if (_state.messages.length > _meta.messageLimit) {
      _state.messages = _state.messages.slice(
        _state.messages.length - _meta.messageLimit
      );
    }
  }

  public constructor(
    public readonly model: LocationModel,
    options: {
      state: LocationState;
      messagesState: LocationMessagesState;
      apiKeys?: LlmApiKeyModel[];
    }
  ) {
    super();
    this.id = model.id as LocationId;
    this.key = `location:${model.id}` as LocationKey;
    this.meta = DEFAULT_LOCATION_META;

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

  public get meta(): LocationMeta {
    return this._meta;
  }

  public set meta(value: LocationMeta) {
    this._meta = {
      ...value,
      ...(this.model.meta as object),
    };
  }

  public addEntity(entity: Entity, updateIds: boolean = true): void {
    this.entities[entity.key] = entity;
    if (entity instanceof Agent) {
      this.agents[entity.model.id as AgentId] = entity;
    } else if (entity instanceof User) {
      this.users[entity.model.id as UserId] = entity;
    } else if (entity instanceof Gimmick) {
      this.gimmicks[entity.id as GimmickId] = entity;
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
    } else if (entity instanceof Gimmick) {
      delete this.gimmicks[entity.id as GimmickId];
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

  public getEntityState(key: EntityKey): LocationEntityState | undefined {
    return this._entityStates[key];
  }

  public getEntityStateByTarget(target: Entity): LocationEntityState {
    const key = `${target.type}:${target.id}` as EntityKey;
    return this._entityStates[key];
  }

  public addEntityState(state: LocationEntityState): LocationEntityState {
    const key: EntityKey = `${state.targetType}:${state.targetId}` as EntityKey;
    const entity = this.entities[key];

    if (!entity) {
      throw new Error(`Entity with key ${key} not found`);
    }

    this._entityStates[key] = entity.fixLocationEntityState(state);

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
      canvases: this.meta.canvases.map((c) => {
        const canvas = this.state.canvases[c.name];
        return new LocationCanvasContext({
          name: c.name,
          description: c.description,
          maxLength: c.maxLength,
          lastModeifierKey: canvas.lastModifierEntityType
            ? (`${canvas.lastModifierEntityType}:${canvas.lastModifierEntityId}` as EntityKey)
            : (EntityType.System as EntityKey),
          lastModifiedAt: canvas.updatedAt,
          text: canvas.text,
        });
      }),
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
    if (this.core) {
      const coreMeta =
        typeof this.meta.core === 'string'
          ? { name: this.meta.core }
          : this.meta.core;
      if (isEqual(this.core.meta, coreMeta)) {
        return;
      }
    }
    this.core = LocationCoreFactory.createCore(this);
  }

  public async addMessage(message: LocationMessage): Promise<void> {
    const messageLengthLimit: number = this.meta.messageLengthLimit;
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

  public async addGimmickMessage(
    gimmick: Gimmick,
    options: {
      message?: string;
      expression?: string;
      image?: string;
      action?: string;
      emotion?: string;
    } = {}
  ): Promise<void> {
    const locationMessage: LocationMessage = {
      entityType: EntityType.Gimmick,
      entityId: gimmick.id as GimmickId,
      name: gimmick.name,
      message: options.message,
      expression: options.expression,
      image: options.image,
      action: options.action,
      emotion: options.emotion,
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

  public async updateCanvas(
    modifierEntityType: EntityType,
    modifierEntityId: EntityId,
    canvasName: string,
    text: string
  ): Promise<void> {
    const canvas = this.state.canvases[canvasName];
    if (!canvas) {
      throw new Error(`Canvas with name ${canvasName} not found`);
    }

    canvas.lastModifierEntityType = modifierEntityType;
    canvas.lastModifierEntityId = modifierEntityId;
    canvas.text = text;
    canvas.updatedAt = new Date();

    await this.emitAsync(
      'canvasUpdated',
      this,
      modifierEntityType,
      modifierEntityId,
      canvasName,
      text
    );
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
