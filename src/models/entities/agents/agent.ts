import {
  ENV,
  LlmFactory,
  LlmService,
  LlmToolCall,
} from '@little-samo/samo-ai/common';

import { Entity } from '../entity';
import { EntityType, EntityKey, EntityId } from '../entity.types';
import { Location } from '../../locations';
import { ItemModel } from '../entity.item-model';

import { AgentCore } from './cores/agent.core';
import { AgentMemory, AgentState } from './states/agent.state';
import { AgentContext } from './agent.context';
import { AgentMeta, DEFAULT_AGENT_META } from './agent.meta';
import { AgentAction } from './actions/agent.action';
import {
  AgentEntityMemory,
  AgentEntityState,
} from './states/agent.entity-state';
import { AgentCoreFactory } from './cores';
import { AgentActionFactory } from './actions';
import { AgentInputBuilder, AgentInputFactory } from './inputs';
import { AgentModel } from './agent.model';
import { AgentId } from './agent.types';

export class Agent extends Entity {
  public static readonly ACTION_LLM_INDEX = 0;
  public static readonly MINI_LLM_INDEX = 1;

  private static _createEmptyState(agentId: AgentId): AgentState {
    return {
      agentId,
      memories: [],
      updatedAt: new Date(),
      createdAt: new Date(),
    };
  }

  public static fixState(state: AgentState, meta: AgentMeta): void {
    if (state.memories.length < meta.memoryLimit) {
      state.memories = state.memories.concat(
        Array(meta.memoryLimit - state.memories.length).fill({
          memory: '',
        })
      );
    } else if (state.memories.length > meta.memoryLimit) {
      state.memories = state.memories.slice(0, meta.memoryLimit);
    }
  }

  public fixEntityState(state: AgentEntityState): void {
    if (state.memories.length < this.meta.entityMemoryLimit) {
      state.memories = state.memories.concat(
        Array(this.meta.entityMemoryLimit - state.memories.length).fill({
          memory: '',
        })
      );
    } else if (state.memories.length > this.meta.entityMemoryLimit) {
      state.memories = state.memories.slice(0, this.meta.entityMemoryLimit);
    }
  }

  public readonly core: AgentCore;

  public readonly inputs: AgentInputBuilder[] = [];
  public readonly llms: LlmService[] = [];
  public readonly actions: Record<string, AgentAction> = {};

  private readonly _entityStates: Record<EntityKey, AgentEntityState> = {};

  public constructor(
    public readonly location: Location,
    public readonly model: AgentModel,
    options: {
      state?: AgentState;
      items?: ItemModel[];
    } = {}
  ) {
    const meta = { ...DEFAULT_AGENT_META, ...(model.meta as object) };
    const state = options.state ?? Agent._createEmptyState(model.id as AgentId);
    const items = options.items ?? [];
    Agent.fixState(state, meta);

    super(location, model.name, meta, state, items);

    this.core = AgentCoreFactory.createCore(this);

    for (const llm of meta.llms) {
      const apiKey = location.apiKeys[llm.platform];
      if (apiKey) {
        const llmService = LlmFactory.create(
          llm.platform,
          llm.model,
          apiKey.key,
          {
            reasoning: llm.reasoning,
          }
        );
        this.llms.push(llmService);
      }
    }
    for (const input of meta.inputs) {
      this.inputs.push(AgentInputFactory.createInput(input, location, this));
    }
    const actions = [
      ...(this.llms.at(0)?.reasoning ? [] : ['reasoning:latest']),
      ...meta.actions,
      ...location.meta.actions,
    ];
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

  public override get type(): 'agent' {
    return EntityType.Agent;
  }

  public override get id(): AgentId {
    return this.model.id as AgentId;
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
    const context = new AgentContext({
      ...super.context,
      handle: this.model.username ?? undefined,
    });
    return context;
  }

  public get memories(): AgentMemory[] {
    return this.state.memories;
  }

  public getEntityMemories(key: EntityKey): AgentEntityMemory[] | undefined {
    const entityState = this._entityStates[key];
    return entityState?.memories;
  }

  public getEntityStates(): AgentEntityState[] {
    return Object.values(this._entityStates);
  }

  public getEntityState(key: EntityKey): AgentEntityState | undefined {
    return this._entityStates[key];
  }

  public getEntityStateByTarget(
    type: EntityType,
    id: EntityId
  ): AgentEntityState | undefined {
    const key = `${type}:${id}` as EntityKey;
    return this._entityStates[key];
  }

  public addEntityState(state: AgentEntityState): AgentEntityState {
    const key = `${state.targetType}:${state.targetId}` as EntityKey;

    this.fixEntityState(state);
    this._entityStates[key] = state;

    return state;
  }

  public removeEntityState(type: EntityType, id: EntityId): void {
    const key = `${type}:${id}` as EntityKey;
    delete this._entityStates[key];
  }

  public async setMemory(index: number, memory: string): Promise<void> {
    await this.location.emitAsync(
      'agentUpdateMemory',
      this,
      this.state,
      index,
      memory
    );
    this.state.memories[index] = {
      memory,
      createdAt: new Date(),
    };
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

    await this.location.emitAsync(
      'agentUpdateEntityMemory',
      this,
      entityState,
      index,
      memory
    );
    entityState.memories[index] = {
      memory,
      createdAt: new Date(),
    };
  }

  public async setExpression(expression: string): Promise<void> {
    if (expression.startsWith('*') && expression.endsWith('*')) {
      expression = expression.slice(1, -1);
    }
    const entityState = this.location.getEntityStateByTarget(this);
    await this.location.emitAsync(
      'agentUpdateExpression',
      this,
      entityState,
      expression
    );
    entityState.expression = expression;
  }

  public async setActive(active: boolean): Promise<void> {
    const entityState = this.location.getEntityStateByTarget(this);
    await this.location.emitAsync(
      'agentUpdateActive',
      this,
      entityState,
      active
    );
    entityState.isActive = active;
  }

  public override createItem(itemDataId: number): ItemModel {
    return {
      id: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerAgentId: this.id,
      ownerUserId: null,
      itemDataId,
      count: 0,
    };
  }

  public async update(): Promise<boolean> {
    if (this.location.getEntityState(this.key)?.isActive === false) {
      if (ENV.DEBUG) {
        console.log(`Skip update for inactive agent ${this.model.name}`);
      }
      return false;
    }
    return await this.core.update();
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
    await this.location.emitAsync('agentExecuteNextActions', this);

    const input = this.inputs[inputIndex];
    const messages = input.buildNextActions();
    const llm = this.llms.at(llmIndex) ?? this.llms.at(0);
    if (!llm) {
      throw new Error('No LlmService found');
    }
    const toolCalls = await llm.useTools(
      messages,
      Object.values(this.actions),
      {
        maxTokens: this.meta.maxTokens,
        temperature: this.meta.temperature,
        verbose: ENV.DEBUG,
        maxToolCalls: this.meta.actionLimit,
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
    const llm = this.llms.at(llmIndex) ?? this.llms.at(0);
    if (!llm) {
      throw new Error('No LlmService found');
    }
    const result = await llm.generate(messages, {
      maxTokens: this.meta.evaluateMaxTokens,
      temperature: this.meta.evaluateTemperature,
      verbose: false,
    });
    let resultJson;
    try {
      resultJson = JSON.parse(result);
    } catch (error) {
      console.error(`Error parsing action condition result: ${result}`);
      throw error;
    }
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.model.name} evaluated action condition: ${resultJson.should_act}
${resultJson.reasoning}`
      );
    }
    return resultJson.should_act ?? false;
  }
}
