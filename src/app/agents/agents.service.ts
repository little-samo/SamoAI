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
import { PrismaService } from '@app/global/prisma.service';
import { RedisService } from '@app/global/redis.service';
import { JsonObject } from '@prisma/client/runtime/library';
import { AgentId, UserId } from '@models/entities/entity.types';
import { EntityType } from '@models/entities/entity.types';
import { EntityId } from '@models/entities/entity.types';

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

  public async getAllTelegramAgentModels(): Promise<AgentModel[]> {
    return this.prisma.agentModel.findMany({
      where: { telegramBotToken: { not: null }, isDeleted: false },
    });
  }

  public async getAgentModel(agentId: number): Promise<AgentModel> {
    const agent = await this.prisma.agentModel.findUnique({
      where: { id: agentId, isDeleted: false },
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
      where: { id: { in: agentIds }, isDeleted: false },
    });

    return agents.reduce(
      (acc, agent) => {
        acc[agent.id] = agent;
        return acc;
      },
      {} as Record<number, AgentModel>
    );
  }

  public async getAgentByTelegramId(
    telegramId: bigint
  ): Promise<AgentModel | null> {
    return this.prisma.agentModel.findUnique({
      where: { telegramId },
    });
  }

  public async getAgentByTelegramBotToken(
    telegramBotToken: string
  ): Promise<AgentModel | null> {
    return this.prisma.agentModel.findUnique({
      where: { telegramBotToken },
    });
  }

  public async getOrCreateTelegramAgentModel(
    ownerUserId: number,
    agentName: string,
    telegramId: bigint,
    telegramBotToken: string,
    telegramUsername?: string
  ): Promise<AgentModel> {
    if (telegramUsername) {
      const agent = await this.prisma.agentModel.findUnique({
        where: { telegramUsername },
      });
      if (agent && agent.telegramBotToken !== telegramBotToken) {
        await this.prisma.agentModel.update({
          where: { id: agent.id },
          data: { telegramBotToken: null },
        });
      }
    }

    return await this.prisma.agentModel.upsert({
      where: { telegramBotToken },
      update: { name: agentName, ownerUserId, telegramUsername },
      create: {
        name: agentName,
        ownerUserId,
        telegramId,
        telegramBotToken,
        telegramUsername,
      },
    });
  }

  public async getAllAgentsByOwnerUserId(
    ownerUserId: number
  ): Promise<AgentModel[]> {
    return this.prisma.agentModel.findMany({
      where: { ownerUserId, isDeleted: false },
    });
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
    if (agentIds.length === 0) {
      return {};
    }

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

    if (Object.keys(states).length > 0) {
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
    }

    return states;
  }

  public async getAgentEntityState(
    agentId: AgentId,
    targetType: EntityType,
    targetId: EntityId
  ): Promise<null | AgentEntityState> {
    const cacheKey = `${this.AGENT_ENTITY_STATE_PREFIX}${agentId}:${targetType}:${targetId}`;

    const cachedState = await this.redis.get(cacheKey);

    if (cachedState) {
      return JSON.parse(cachedState);
    }

    const entityState = await this.agentEntityStateModel
      .findOne({
        agentId,
        targetType,
        targetId,
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
    agentIds: AgentId[],
    targetAgentIds: AgentId[],
    targetUserIds: UserId[]
  ): Promise<Record<number, AgentEntityState[]>> {
    if (
      agentIds.length === 0 ||
      (targetAgentIds.length === 0 && targetUserIds.length === 0)
    ) {
      return {};
    }

    const states: Record<number, AgentEntityState[]> = {};

    const cacheKeys: AgentEntityStateCacheKey[] = [];
    for (let i = 0; i < agentIds.length; i++) {
      const agentId = agentIds[i];
      for (const targetAgentId of targetAgentIds) {
        if (agentId === targetAgentId) {
          continue;
        }
        const cacheKey = `${this.AGENT_ENTITY_STATE_PREFIX}${agentId}:agent:${targetAgentId}`;
        cacheKeys.push({
          agentId,
          targetAgentId,
          cacheKey,
        });
      }
      for (const targetUserId of targetUserIds) {
        const cacheKey = `${this.AGENT_ENTITY_STATE_PREFIX}${agentId}:user:${targetUserId}`;
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
            const cacheKey = `${this.AGENT_ENTITY_STATE_PREFIX}${entityState.agentId}:${entityState.targetType}:${entityState.targetId}`;
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
    await this.agentStateModel.updateOne(
      { agentId: state.agentId },
      { $set: state },
      { upsert: true }
    );

    const cacheKey = `${this.AGENT_STATE_PREFIX}${state.agentId}`;
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
  }

  public async saveAgentStateMemory(
    state: AgentState,
    index: number,
    memory: string
  ): Promise<void> {
    await this.agentStateModel.updateOne(
      { agentId: state.agentId },
      { $set: { [`memories.${index}`]: memory } }
    );

    const cacheKey = `${this.AGENT_STATE_PREFIX}${state.agentId}`;
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
  }

  public async saveAgentEntityState(state: AgentEntityState): Promise<void> {
    await this.agentEntityStateModel.updateOne(
      {
        agentId: state.agentId,
        targetType: state.targetType,
        targetId: state.targetId,
      },
      { $set: state },
      { upsert: true }
    );

    const cacheKey = `${this.AGENT_ENTITY_STATE_PREFIX}${state.agentId}:${state.targetType}:${state.targetId}`;
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
  }

  public async saveAgentEntityStateMemory(
    state: AgentEntityState,
    index: number,
    memory: string
  ): Promise<void> {
    await this.agentEntityStateModel.updateOne(
      {
        agentId: state.agentId,
        targetType: state.targetType,
        targetId: state.targetId,
      },
      { $set: { [`memories.${index}`]: memory } }
    );

    const cacheKey = `${this.AGENT_ENTITY_STATE_PREFIX}${state.agentId}:${state.targetType}:${state.targetId}`;
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
  }

  public async setAgentMeta(agentId: number, meta: JsonObject): Promise<void> {
    await this.prisma.agentModel.update({
      where: { id: agentId },
      data: { meta },
    });
  }

  public async setAgentActive(
    agentId: number,
    isActive: boolean
  ): Promise<void> {
    await this.prisma.agentModel.update({
      where: { id: agentId },
      data: { isActive },
    });
  }

  public async deleteAgentModel(agentId: number): Promise<void> {
    await this.prisma.agentModel.update({
      where: { id: agentId },
      data: {
        telegramUsername: null,
        telegramBotToken: null,
        isDeleted: true,
      },
    });
  }
}
