import { EventEmitter } from 'events';

import { LocationModel } from '@prisma/client';
import { Agent } from '@models/entities/agents/agent';
import { User } from '@models/entities/users/user';
import { Entity, EntityKey } from '@models/entities/entity';

import { LocationMessage } from './states/location.messages-state';
import { LocationState } from './states/location.state';
import { DEFAULT_LOCATION_META, LocationMeta } from './location.meta';
import { LocationCore } from './cores/location.core';
import { LocationContext } from './location.context';

export type LocationId = number & { __locationId: true };

export type LocationKey = string & { __locationKey: true };

export class Location extends EventEmitter {
  public readonly id: LocationId;
  public readonly key: LocationKey;

  public readonly meta: LocationMeta;

  public readonly core: LocationCore;

  public readonly entities: Record<EntityKey, Entity> = {};

  protected constructor(
    public readonly model: LocationModel,
    public state: LocationState,
    public readonly messages: LocationMessage[]
  ) {
    super();
    this.id = model.id as LocationId;
    this.key = `location:${model.id}` as LocationKey;
    this.meta = { ...DEFAULT_LOCATION_META, ...(model.meta as object) };
    this.core = LocationCore.createCore(this);
  }

  public addEntity(entity: Entity, updateIds: boolean = true): void {
    this.entities[entity.key] = entity;
    if (updateIds) {
      if (entity instanceof Agent) {
        this.state.agentIds.push(entity.model.id);
      } else if (entity instanceof User) {
        this.state.userIds.push(entity.model.id);
      }
    }
  }

  public removeEntity(entity: Entity, updateIds: boolean = true): void {
    delete this.entities[entity.key];
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

  public get context(): LocationContext {
    return {
      name: this.model.name,
      description: this.meta.description,
      messages: this.messages.map((message) => ({
        key: message.agentId
          ? (`agent:${message.agentId}` as EntityKey)
          : (`user:${message.userId}` as EntityKey),
        name: message.name,
        message: message.message,
        expression: message.expression,
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
    this.messages.push(message);
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
}
