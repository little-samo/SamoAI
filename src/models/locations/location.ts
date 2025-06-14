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
import { LocationId, LocationKey } from './location.types';
import { LocationEntityState } from './states/location.entity-state';
import { LocationMessage } from './states/location.message';
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

  private readonly entities: Record<EntityKey, Entity> = {};
  private readonly agents: Map<AgentId, Agent> = new Map();
  private readonly users: Map<UserId, User> = new Map();
  private readonly gimmicks: Map<GimmickId, Gimmick> = new Map();

  public readonly state: LocationState;
  public readonly messages: LocationMessage[];

  public readonly apiKeys: Record<string, LlmApiKeyModel> = {};

  private readonly entityStates: Record<EntityKey, LocationEntityState> = {};

  public updatingEntity: Entity | undefined;

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

  public static fixMessages(
    messages: LocationMessage[],
    meta: LocationMeta
  ): LocationMessage[] {
    return messages.slice(messages.length - meta.messageLimit);
  }

  public constructor(
    public readonly model: LocationModel,
    options: {
      state: LocationState;
      messages: LocationMessage[];
      apiKeys?: LlmApiKeyModel[];
    }
  ) {
    super();
    this.id = model.id as LocationId;
    this.key = `location:${model.id}` as LocationKey;
    this.meta = DEFAULT_LOCATION_META;

    const { state, messages, apiKeys } = options;

    Location.fixState(state, this.meta);
    this.state = state;

    this.messages = Location.fixMessages(messages, this.meta);

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
      this.agents.set(entity.model.id as AgentId, entity);
    } else if (entity instanceof User) {
      this.users.set(entity.model.id as UserId, entity);
    } else if (entity instanceof Gimmick) {
      this.gimmicks.set(entity.id as GimmickId, entity);
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
      this.agents.delete(entity.model.id as AgentId);
    } else if (entity instanceof User) {
      this.users.delete(entity.model.id as UserId);
    } else if (entity instanceof Gimmick) {
      this.gimmicks.delete(entity.id as GimmickId);
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

  public getEntity(key: EntityKey): Entity | undefined {
    return this.entities[key];
  }

  public getEntities(): Entity[] {
    return Object.values(this.entities);
  }

  public getEntityIds(): EntityId[] {
    return Object.values(this.entities).map((entity) => entity.id);
  }

  public getEntityCount(): number {
    return Object.keys(this.entities).length;
  }

  public getAgent(id: AgentId): Agent | undefined {
    return this.agents.get(id);
  }

  public getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  public getAgentIds(): AgentId[] {
    return Array.from(this.agents.keys());
  }

  public getAgentCount(): number {
    return this.agents.size;
  }

  public getUser(id: UserId): User | undefined {
    return this.users.get(id);
  }

  public getUsers(): User[] {
    return Array.from(this.users.values());
  }

  public getUserIds(): UserId[] {
    return Array.from(this.users.keys());
  }

  public getUserCount(): number {
    return this.users.size;
  }

  public getGimmick(id: GimmickId): Gimmick | undefined {
    return this.gimmicks.get(id);
  }

  public getGimmicks(): Gimmick[] {
    return Array.from(this.gimmicks.values());
  }

  public getGimmickIds(): GimmickId[] {
    return Array.from(this.gimmicks.keys());
  }

  public getGimmickCount(): number {
    return this.gimmicks.size;
  }

  public getEntityState(key: EntityKey): LocationEntityState | undefined {
    return this.entityStates[key];
  }

  public getEntityStateByTarget(target: Entity): LocationEntityState {
    const key = `${target.type}:${target.id}` as EntityKey;
    return this.entityStates[key];
  }

  public addEntityState(state: LocationEntityState): LocationEntityState {
    const key: EntityKey = `${state.targetType}:${state.targetId}` as EntityKey;
    const entity = this.entities[key];

    if (!entity) {
      throw new Error(`Entity with key ${key} not found`);
    }

    this.entityStates[key] = entity.fixLocationEntityState(state);

    return state;
  }

  public removeEntityStateByTarget(target: Entity): void {
    const key = target.key;
    delete this.entityStates[key];
  }

  public get context(): LocationContext {
    return new LocationContext({
      key: this.key,
      description: this.meta.description,
      messages: this.messages.map(Location.messageToContext),
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
    const lastMessage = this.messages.at(-1);
    return lastMessage ? Location.messageToContext(lastMessage) : undefined;
  }

  public getEntityStates(): LocationEntityState[] {
    return Object.values(this.entityStates);
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
    this.messages.push(message);
    this.messages.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    if (this.messages.length > this.meta.messageLimit) {
      this.messages.shift();
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
      locationId: this.id,
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
      locationId: this.id,
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
      locationId: this.id,
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
      locationId: this.id,
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
    text: string,
    reason?: string
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
      text,
      reason
    );
  }

  public async editCanvas(
    modifierEntityType: EntityType,
    modifierEntityId: EntityId,
    canvasName: string,
    existingContent: string,
    newContent: string,
    reason?: string
  ): Promise<boolean> {
    const canvas = this.state.canvases[canvasName];
    if (!canvas) {
      throw new Error(`Canvas with name ${canvasName} not found`);
    }

    let updatedText: string;

    if (existingContent === '') {
      // If existing_content is empty, append new content
      updatedText = canvas.text + newContent;
    } else {
      // Check if existing content exists in the canvas
      const existingIndex = canvas.text.indexOf(existingContent);
      if (existingIndex === -1) {
        // Return false instead of throwing error when existing content not found
        return false;
      }

      // Replace the first occurrence of existing content with new content
      updatedText =
        canvas.text.substring(0, existingIndex) +
        newContent +
        canvas.text.substring(existingIndex + existingContent.length);
    }

    // Check max length constraint
    const canvasMeta = this.meta.canvases.find((c) => c.name === canvasName);
    if (canvasMeta && updatedText.length > canvasMeta.maxLength) {
      updatedText = updatedText.substring(0, canvasMeta.maxLength);
    }

    canvas.lastModifierEntityType = modifierEntityType;
    canvas.lastModifierEntityId = modifierEntityId;
    canvas.text = updatedText;
    canvas.updatedAt = new Date();

    await this.emitAsync(
      'canvasEdited',
      this,
      modifierEntityType,
      modifierEntityId,
      canvasName,
      existingContent,
      newContent,
      updatedText,
      reason
    );

    return true;
  }

  public async init(): Promise<void> {
    this.reloadCore();
    for (const gimmick of this.gimmicks.values()) {
      await gimmick.init();
    }
    for (const agent of this.agents.values()) {
      await agent.init();
    }
    for (const user of this.users.values()) {
      await user.init();
    }
  }

  public async update(): Promise<number> {
    await this.init();
    if (ENV.DEBUG) {
      console.log(
        `Updating location ${this.model.name}, core: ${this.core.constructor.name}, ${this.agents.size} agents, ${this.users.size} users`
      );
    }
    return await this.core.update();
  }
}
