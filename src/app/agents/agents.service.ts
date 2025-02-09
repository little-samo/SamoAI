import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

  public async getAgentEntityState(
    agentId: number,
    targetAgentId?: number,
    targetUserId?: number
  ): Promise<null | AgentEntityState> {
    if (!targetAgentId && !targetUserId) {
      throw new Error('No target agent or user provided');
    }

    let cacheKey = `${this.AGENT_ENTITY_STATE_PREFIX}${agentId}:`;
    if (targetAgentId) {
      cacheKey += `agent:${targetAgentId}`;
    } else if (targetUserId) {
      cacheKey += `user:${targetUserId}`;
    }

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

  public async saveAgentModel(model: AgentModel): Promise<void> {
    await this.prisma.agentModel.upsert({
      where: { id: model.id },
      update: {
        ...model,
        meta: model.meta as JsonObject,
      },
      create: {
        ...model,
        meta: model.meta as JsonObject,
      },
    });
  }

  public async saveAgentState(state: AgentState): Promise<void> {
    await this.agentStateModel.updateOne(
      { agentId: state.agentId },
      { $set: { ...state } },
      { upsert: true }
    );

    const cacheKey = `${this.AGENT_STATE_PREFIX}${state.agentId}`;
    await this.redis.set(cacheKey, JSON.stringify(state), this.CACHE_TTL);
  }

  public async saveAgentEntityState(state: AgentEntityState): Promise<void> {
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
  }
}
