import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { AgentEntityStateDocument } from '@models/entities/agents/states/agent.entity-state';
import { AgentEntityState } from '@models/entities/agents/states/agent.entity-state';
import { AgentsRepository } from '@core/repositories/agents.repository';
import {
  AgentState,
  AgentStateDocument,
} from '@models/entities/agents/states/agent.state';
import { AgentModel } from '@prisma/client';
import { PrismaService } from '@app/prisma/prisma.service';
import { RedisService } from '@app/redis/redis.service';
import { JsonObject } from '@prisma/client/runtime/library';

interface AgentEntityStateCacheKey {
  agentId: number;
  targetAgentId?: number;
  targetUserId?: number;
  cacheKey: string;
}

@Injectable()
export class AgentsService implements AgentsRepository {
  private readonly CACHE_TTL = 300; // 5 minutes in seconds
  private readonly AGENT_STATE_PREFIX = 'cache:agent_state:';
  private readonly AGENT_ENTITY_STATE_PREFIX = 'cache:agent_entity_state:';

  protected readonly logger = new Logger(this.constructor.name);

  public constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    @InjectModel(AgentState.name)
    private agentStateModel: Model<AgentStateDocument>,
    @InjectModel(AgentEntityState.name)
    private agentEntityStateModel: Model<AgentEntityStateDocument>
  ) {}

  public async getAllAgentModels(): Promise<AgentModel[]> {
    return this.prisma.agentModel.findMany();
  }

  public async getAgentModel(agentId: number): Promise<AgentModel> {
    const agent = await this.prisma.agentModel.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    return agent;
  }

  public async getAgentModels(
    agentIds: number[]
  ): Promise<Record<number, AgentModel>> {
    const agents = await this.prisma.agentModel.findMany({
      where: { id: { in: agentIds } },
    });

    return agents.reduce(
      (acc, agent) => {
        acc[agent.id] = agent;
        return acc;
      },
      {} as Record<number, AgentModel>
    );
  }

  public async getAgentState(agentId: number): Promise<null | AgentState> {
    const cacheKey = `${this.AGENT_STATE_PREFIX}${agentId}`;
    const cachedState = await this.redis.get(cacheKey);

    if (cachedState) {
      return JSON.parse(cachedState);
    }

    const state = await this.agentStateModel.findOne({ agentId }).exec();

    if (state) {
      await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
    }

    return state;
  }

  public async getAgentStates(
    agentIds: number[]
  ): Promise<Record<number, AgentState>> {
    const states: Record<number, AgentState> = {};

    const cacheKeys = agentIds.map((id) => `${this.AGENT_STATE_PREFIX}${id}`);
    const cachedStates = await this.redis.mget(cacheKeys);

    for (let i = 0; i < agentIds.length; i++) {
      const agentId = agentIds[i];
      const cachedState = cachedStates[i];

      if (cachedState) {
        states[agentId] = JSON.parse(cachedState);
      }
    }

    const remainingAgentIds = agentIds.filter((id) => !states[id]);
    if (remainingAgentIds.length > 0) {
      const statesFromDb = await this.agentStateModel
        .find({ agentId: { $in: remainingAgentIds } })
        .exec();

      for (const state of statesFromDb) {
        states[state.agentId] = state;
      }
    }

    const cacheEntries = Object.values(states).reduce(
      (acc, state) => {
        const cacheKey = `${this.AGENT_STATE_PREFIX}${state.agentId}`;
        acc[cacheKey] = JSON.stringify(state);
        return acc;
      },
      {} as Record<string, string>
    );

    await this.redis.mset(cacheEntries);

    await Promise.all(
      Object.keys(cacheEntries).map((key) =>
        this.redis.expire(key, this.CACHE_TTL)
      )
    );

    return states;
  }

  private getAgentEntityStateCacheKeyById(
    agentId: number,
    targetAgentId?: number,
    targetUserId?: number
  ): string {
    if (targetAgentId) {
      return `${this.AGENT_ENTITY_STATE_PREFIX}${agentId}:agent:${targetAgentId}`;
    } else if (targetUserId) {
      return `${this.AGENT_ENTITY_STATE_PREFIX}${agentId}:user:${targetUserId}`;
    }
    throw new Error('No target agent or user provided');
  }

  private getAgentEntityStateCacheKey(
    agentEntityState: AgentEntityState
  ): string {
    return this.getAgentEntityStateCacheKeyById(
      agentEntityState.agentId,
      agentEntityState.targetAgentId,
      agentEntityState.targetUserId
    );
  }

  public async getAgentEntityState(
    agentId: number,
    targetAgentId?: number,
    targetUserId?: number
  ): Promise<null | AgentEntityState> {
    if (!targetAgentId && !targetUserId) {
      throw new Error('No target agent or user provided');
    }

    const cacheKey = this.getAgentEntityStateCacheKeyById(
      agentId,
      targetAgentId,
      targetUserId
    );

    const cachedState = await this.redis.get(cacheKey);

    if (cachedState) {
      return JSON.parse(cachedState);
    }

    const entityState = await this.agentEntityStateModel
      .findOne({
        agentId,
        targetAgentId,
        targetUserId,
      })
      .exec();

    if (entityState) {
      await this.redis.set(
        cacheKey,
        JSON.stringify(entityState),
        this.CACHE_TTL
      );
    }

    return entityState;
  }

  public async getAgentEntityStates(
    agentIds: number[],
    targetAgentIds: number[],
    targetUserIds: number[]
  ): Promise<Record<number, AgentEntityState[]>> {
    const states: Record<number, AgentEntityState[]> = {};

    const cacheKeys: AgentEntityStateCacheKey[] = [];
    for (let i = 0; i < agentIds.length; i++) {
      const agentId = agentIds[i];
      for (const targetAgentId of targetAgentIds) {
        if (agentId === targetAgentId) {
          continue;
        }
        const cacheKey = this.getAgentEntityStateCacheKeyById(
          agentId,
          targetAgentId
        );
        cacheKeys.push({
          agentId,
          targetAgentId,
          cacheKey,
        });
      }
      for (const targetUserId of targetUserIds) {
        const cacheKey = this.getAgentEntityStateCacheKeyById(
          agentId,
          undefined,
          targetUserId
        );
        cacheKeys.push({
          agentId,
          targetUserId,
          cacheKey,
        });
      }
    }

    const remainingAgentIdTargetAgentIds: Record<number, number[]> = {};
    const remainingAgentIdTargetUserIds: Record<number, number[]> = {};
    const cachedStates = await this.redis.mget(
      cacheKeys.map((key) => key.cacheKey)
    );

    for (let i = 0; i < cacheKeys.length; i++) {
      const cacheKey = cacheKeys[i];
      const cachedState = cachedStates[i];
      if (cachedState) {
        const state = JSON.parse(cachedState) as AgentEntityState;
        if (!states[state.agentId]) {
          states[state.agentId] = [];
        }
        states[state.agentId].push(state);
      } else {
        if (cacheKey.targetAgentId) {
          if (!remainingAgentIdTargetAgentIds[cacheKey.agentId]) {
            remainingAgentIdTargetAgentIds[cacheKey.agentId] = [];
          }
          remainingAgentIdTargetAgentIds[cacheKey.agentId].push(
            cacheKey.targetAgentId
          );
        } else if (cacheKey.targetUserId) {
          if (!remainingAgentIdTargetUserIds[cacheKey.agentId]) {
            remainingAgentIdTargetUserIds[cacheKey.agentId] = [];
          }
          remainingAgentIdTargetUserIds[cacheKey.agentId].push(
            cacheKey.targetUserId
          );
        }
      }
    }

    const remainingQueries: FilterQuery<AgentEntityState>[] = [];

    Object.entries(remainingAgentIdTargetAgentIds).forEach(
      ([agentId, targetIds]) => {
        remainingQueries.push({
          agentId: parseInt(agentId),
          targetAgentId: { $in: targetIds },
        });
      }
    );

    Object.entries(remainingAgentIdTargetUserIds).forEach(
      ([agentId, targetIds]) => {
        remainingQueries.push({
          agentId: parseInt(agentId),
          targetUserId: { $in: targetIds },
        });
      }
    );

    if (remainingQueries.length > 0) {
      const statesFromDb = await this.agentEntityStateModel
        .find({ $or: remainingQueries })
        .exec();

      for (const state of statesFromDb) {
        if (!states[state.agentId]) {
          states[state.agentId] = [];
        }
        states[state.agentId].push(state);
      }
    }

    if (Object.keys(states).length > 0) {
      const cacheEntries = Object.values(states).reduce(
        (acc, entityStates) => {
          for (const entityState of entityStates) {
            const cacheKey = this.getAgentEntityStateCacheKey(entityState);
            acc[cacheKey] = JSON.stringify(entityState);
          }
          return acc;
        },
        {} as Record<string, string>
      );

      await this.redis.mset(cacheEntries);

      await Promise.all(
        Object.keys(cacheEntries).map((key) =>
          this.redis.expire(key, this.CACHE_TTL)
        )
      );
    }

    return states;
  }

  public async saveAgentModel(model: AgentModel): Promise<AgentModel> {
    if (!model.id) {
      return await this.prisma.agentModel.create({
        data: {
          ...model,
          meta: model.meta as JsonObject,
        },
      });
    }
    return await this.prisma.agentModel.update({
      where: { id: model.id },
      data: {
        ...model,
        meta: model.meta as JsonObject,
      },
    });
  }

  public async saveAgentState(state: AgentState): Promise<void> {
    if (!state.dirty) {
      return;
    }

    await this.agentStateModel.updateOne(
      { agentId: state.agentId },
      { $set: { ...state } },
      { upsert: true }
    );

    const cacheKey = `${this.AGENT_STATE_PREFIX}${state.agentId}`;
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);

    state.dirty = false;
  }

  public async saveAgentStates(states: AgentState[]): Promise<void> {
    states = states.filter((state) => state.dirty);
    if (states.length === 0) {
      return;
    }

    await this.agentStateModel.bulkWrite(
      states.map((state) => ({
        updateOne: {
          filter: { agentId: state.agentId },
          update: { $set: state },
          upsert: true,
        },
      }))
    );

    const cacheEntries = states.reduce(
      (acc, state) => {
        const cacheKey = `${this.AGENT_STATE_PREFIX}${state.agentId}`;
        acc[cacheKey] = JSON.stringify(state);
        return acc;
      },
      {} as Record<string, string>
    );

    await this.redis.mset(cacheEntries);

    await Promise.all(
      Object.keys(cacheEntries).map((key) =>
        this.redis.expire(key, this.CACHE_TTL)
      )
    );

    states.forEach((state) => {
      state.dirty = false;
    });
  }

  public async saveAgentEntityState(state: AgentEntityState): Promise<void> {
    if (!state.dirty) {
      return;
    }

    await this.agentEntityStateModel.updateOne(
      {
        agentId: state.agentId,
        targetAgentId: state.targetAgentId,
        targetUserId: state.targetUserId,
      },
      { $set: { ...state } },
      { upsert: true }
    );

    let cacheKey = `${this.AGENT_ENTITY_STATE_PREFIX}${state.agentId}:`;
    if (state.targetAgentId) {
      cacheKey += `agent:${state.targetAgentId}`;
    } else if (state.targetUserId) {
      cacheKey += `user:${state.targetUserId}`;
    }
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);

    state.dirty = false;
  }

  public async saveAgentEntityStates(
    states: AgentEntityState[]
  ): Promise<void> {
    states = states.filter((state) => state.dirty);
    if (states.length === 0) {
      return;
    }

    await this.agentEntityStateModel.bulkWrite(
      states.map((state) => ({
        updateOne: {
          filter: {
            agentId: state.agentId,
            targetAgentId: state.targetAgentId,
            targetUserId: state.targetUserId,
          },
          update: { $set: state },
          upsert: true,
        },
      }))
    );

    const cacheEntries = states.reduce(
      (acc, state) => {
        let cacheKey = `${this.AGENT_ENTITY_STATE_PREFIX}${state.agentId}:`;
        if (state.targetAgentId) {
          cacheKey += `agent:${state.targetAgentId}`;
        } else if (state.targetUserId) {
          cacheKey += `user:${state.targetUserId}`;
        }
        acc[cacheKey] = JSON.stringify(state);
        return acc;
      },
      {} as Record<string, string>
    );

    await this.redis.mset(cacheEntries);

    await Promise.all(
      Object.keys(cacheEntries).map((key) =>
        this.redis.expire(key, this.CACHE_TTL)
      )
    );

    states.forEach((state) => {
      state.dirty = false;
    });
  }
}
