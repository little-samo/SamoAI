import { AgentModel } from '@prisma/client';
import { LlmService } from '@common/llms/llm.service';
import { Location } from '@models/locations/location';
import { LlmToolCall } from '@common/llms/llm.tool';
import { LlmFactory } from '@common/llms/llm.factory';
import { ENV } from '@common/config';

import { Entity, EntityKey } from '../entity';

import { AgentCore } from './cores/agent.core';
import { AgentState } from './states/agent.state';
import { AgentContext } from './agent.context';
import { AgentMeta, DEFAULT_AGENT_META } from './agent.meta';
import { AgentAction } from './actions/agent.action';
import { AgentEntityState } from './states/agent.entity-state';
import { AgentCoreFactory } from './cores';
import { AgentActionFactory } from './actions';
import { AgentInputBuilder, AgentInputFactory } from './inputs';

export class Agent extends Entity {
  public static readonly ACTION_LLM_INDEX = 0;
  public static readonly MINI_LLM_INDEX = 1;

  public static createState(model: AgentModel, meta: AgentMeta): AgentState {
    const state = new AgentState();
    state.agentId = model.id;
    state.memories = Array(meta.memoryLimit).fill('');
    return state;
  }

  public static fixState(state: AgentState, meta: AgentMeta): void {
    if (state.memories.length < meta.memoryLimit) {
      state.memories = state.memories.concat(
        Array(meta.memoryLimit - state.memories.length).fill('')
      );
    } else if (state.memories.length > meta.memoryLimit) {
      state.memories = state.memories.slice(0, meta.memoryLimit);
    }

    for (let i = 0; i < state.memories.length; i++) {
      if (!state.memories[i]) {
        state.memories[i] = '';
      }
    }
  }

  public createEntityState(
    targetAgentId?: number,
    targetUserId?: number
  ): AgentEntityState {
    const state = new AgentEntityState();
    state.agentId = this.model.id;
    if (targetAgentId) {
      state.targetType = 'agent';
      state.targetAgentId = targetAgentId;
    } else if (targetUserId) {
      state.targetType = 'user';
      state.targetUserId = targetUserId;
    } else {
      throw new Error('No target agent or user provided');
    }
    state.memories = Array(this.meta.entityMemoryLimit).fill('');
    return state;
  }

  public fixEntityState(state: AgentEntityState): void {
    if (state.memories.length < this.meta.entityMemoryLimit) {
      state.memories = state.memories.concat(
        Array(this.meta.entityMemoryLimit - state.memories.length).fill('')
      );
    } else if (state.memories.length > this.meta.entityMemoryLimit) {
      state.memories = state.memories.slice(0, this.meta.entityMemoryLimit);
    }

    for (let i = 0; i < state.memories.length; i++) {
      if (!state.memories[i]) {
        state.memories[i] = '';
      }
    }
  }

  public readonly key: EntityKey;

  public readonly core: AgentCore;

  public readonly inputs: AgentInputBuilder[] = [];
  public readonly llm: LlmService;
  public readonly llms: LlmService[] = [];
  public readonly actions: Record<string, AgentAction> = {};

  private readonly _entityStates: Record<EntityKey, AgentEntityState> = {};

  public constructor(
    public readonly location: Location,
    public readonly model: AgentModel,
    state?: null | AgentState
  ) {
    const meta = { ...DEFAULT_AGENT_META, ...(model.meta as object) };
    state ??= Agent.createState(model, meta);
    Agent.fixState(state, meta);

    super(location, model.name, meta, state);
    this.key = `agent:${model.id}` as EntityKey;

    this.core = AgentCoreFactory.createCore(this);

    for (const llm of meta.llms) {
      const apiKey = location.apiKeys[llm.platform];
      if (!apiKey) {
        throw new Error(`API key not found for platform: ${llm.platform}`);
      }
      const llmService = LlmFactory.create(llm.platform, llm.model, apiKey.key);
      this.llms.push(llmService);
    }
    this.llm = this.llms[0];
    for (const input of meta.inputs) {
      this.inputs.push(AgentInputFactory.createInput(input, location, this));
    }
    const actions = [...meta.actions, ...location.meta.actions];
    this.actions = Object.fromEntries(
      actions.map((actionWithVersion) => {
        const action = AgentActionFactory.createAction(
          actionWithVersion,
          location,
          this
        );
        return [action.name, action];
      })
    );
  }

  public override get meta(): AgentMeta {
    return super.meta as AgentMeta;
  }

  public set meta(value: AgentMeta) {
    this._meta = value;
  }

  public override get state(): AgentState {
    return super.state as AgentState;
  }

  public set state(value: AgentState) {
    this._state = value;
  }

  public override get context(): AgentContext {
    const handle = this.model.telegramUsername
      ? `@${this.model.telegramUsername}`
      : undefined;
    const context = new AgentContext({
      ...super.context,
      handle,
    });
    return context;
  }

  public get memories(): string[] {
    return this.state.memories;
  }

  public getEntityMemories(key: EntityKey): string[] | undefined {
    const entityState = this._entityStates[key];
    return entityState?.memories;
  }

  public getEntityState(key: EntityKey): AgentEntityState | undefined {
    return this._entityStates[key];
  }

  public getEntityStates(): AgentEntityState[] {
    return Object.values(this._entityStates);
  }

  public getEntityStateKeyByTarget(
    targetAgentId?: number,
    targetUserId?: number
  ): EntityKey {
    if (targetAgentId) {
      return `agent:${targetAgentId}` as EntityKey;
    } else if (targetUserId) {
      return `user:${targetUserId}` as EntityKey;
    } else {
      throw new Error('No target agent or user provided');
    }
  }

  public getEntityStateByTarget(
    targetAgentId?: number,
    targetUserId?: number
  ): AgentEntityState | undefined {
    const key = this.getEntityStateKeyByTarget(targetAgentId, targetUserId);
    return this._entityStates[key];
  }

  public getOrCreateEntityStateByTarget(
    targetAgentId?: number,
    targetUserId?: number
  ): AgentEntityState {
    const key = this.getEntityStateKeyByTarget(targetAgentId, targetUserId);
    const state = this._entityStates[key];
    if (state) {
      return state;
    }
    const newState = this.createEntityState(targetAgentId, targetUserId);
    this._entityStates[key] = newState;
    return newState;
  }

  public addEntityState(state: AgentEntityState): AgentEntityState {
    let key: EntityKey;
    if (state.targetAgentId) {
      key = `agent:${state.targetAgentId}` as EntityKey;
    } else if (state.targetUserId) {
      key = `user:${state.targetUserId}` as EntityKey;
    } else {
      throw new Error('Invalid entity state');
    }

    this.fixEntityState(state);
    this._entityStates[key] = state;

    return state;
  }

  public removeEntityState(
    targetAgentId?: number,
    targetUserId?: number
  ): void {
    let key: EntityKey;
    if (targetAgentId) {
      key = `agent:${targetAgentId}` as EntityKey;
    } else if (targetUserId) {
      key = `user:${targetUserId}` as EntityKey;
    } else {
      throw new Error('No target agent or user provided');
    }
    delete this._entityStates[key];
  }

  public async setMemory(index: number, memory: string): Promise<void> {
    await this.location.executeAgentMemoryHooks(
      this,
      this.state,
      index,
      memory
    );
    this.state.memories[index] = memory;
  }

  public async setEntityMemory(
    key: EntityKey,
    index: number,
    memory: string
  ): Promise<void> {
    const entityState = this.getEntityState(key);
    if (!entityState) {
      throw new Error(`Entity with key ${key} not found`);
    }

    await this.location.executeAgentEntityMemoryHooks(
      this,
      entityState,
      index,
      memory
    );
    entityState.memories[index] = memory;
  }

  public async setExpression(expression: string): Promise<void> {
    if (expression.startsWith('*') && expression.endsWith('*')) {
      expression = expression.slice(1, -1);
    }
    await this.location.executeAgentExpressionHooks(
      this,
      this.state,
      expression
    );
    this.state.expression = expression;
  }

  public async update(): Promise<void> {
    await this.core.update();
  }

  private async executeToolCall(toolCall: LlmToolCall): Promise<void> {
    try {
      const action = this.actions[toolCall.name];
      await action.execute(toolCall);
    } catch (error) {
      console.error(
        `Error executing tool call:\n${JSON.stringify(toolCall, null, 2)}\n${error}`
      );
    }
  }

  public async executeNextActions(
    inputIndex: number = 0,
    llmIndex: number = Agent.ACTION_LLM_INDEX
  ): Promise<void> {
    await this.location.executeAgentExecuteNextActionsPreHooks(this);

    const input = this.inputs[inputIndex];
    const messages = input.buildNextActions();
    const llm = this.llms.at(llmIndex) ?? this.llm;
    const toolCalls = await llm.useTools(
      messages,
      Object.values(this.actions),
      {
        maxTokens: this.meta.maxTokens,
        temperature: this.meta.temperature,
        verbose: ENV.DEBUG,
      }
    );
    for (const toolCall of toolCalls) {
      await this.executeToolCall(toolCall);
    }
  }

  public async evaluateActionCondition(
    inputIndex: number = 0,
    llmIndex: number = Agent.MINI_LLM_INDEX
  ): Promise<boolean> {
    const input = this.inputs[inputIndex];
    const messages = input.buildActionCondition();
    const llm = this.llms.at(llmIndex) ?? this.llm;
    const result = await llm.generate(messages, {
      maxTokens: this.meta.evaluateMaxTokens,
      temperature: this.meta.evaluateTemperature,
      verbose: false,
    });
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.model.name} evaluated action condition: ${result}`
      );
    }
    return result.includes('✅');
  }
}
