import {
  ENV,
  LlmFactory,
  LlmMessage,
  LlmService,
  LlmToolCall,
} from '@little-samo/samo-ai/common';
import { type AgentInputBuilder } from '@little-samo/samo-ai/models';

import { Location, type LocationEntityState } from '../../locations';
import { AgentInputFactory } from '../agents/inputs';
import { Entity } from '../entity';
import { EntityCanvasContext } from '../entity.context';
import { ItemModel } from '../entity.item-model';
import { EntityType, EntityKey, EntityId } from '../entity.types';

import { AgentActionFactory } from './actions';
import { AgentAction } from './actions/agent.action';
import { AgentContext } from './agent.context';
import { AgentMeta, DEFAULT_AGENT_META } from './agent.meta';
import { AgentModel } from './agent.model';
import { AgentId } from './agent.types';
import { AgentCoreFactory } from './cores';
import { AgentCore } from './cores/agent.core';
import {
  AgentEntityMemory,
  AgentEntityState,
} from './states/agent.entity-state';
import { AgentMemory, AgentState } from './states/agent.state';

export class Agent extends Entity {
  public static readonly ACTION_LLM_INDEX = 0;
  public static readonly MINI_LLM_INDEX = 1;
  public static readonly SUMMARY_LLM_INDEX = 1;
  public static readonly MEMORY_LLM_INDEX = 1;

  public static readonly ACTION_INPUT_INDEX = 0;
  public static readonly EVALUATE_INPUT_INDEX = 0;
  public static readonly SUMMARY_INPUT_INDEX = 0;
  public static readonly MEMORY_INPUT_INDEX = 0;

  private static _createEmptyState(agentId: AgentId): AgentState {
    return {
      agentId,
      memories: [],
      summary: '',
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

  public core!: AgentCore;

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
    const meta = {
      ...DEFAULT_AGENT_META,
      ...(model.meta as object),
      ...((location.meta.agentMetas[model.id as AgentId] as object) ?? {}),
    };
    const state = options.state ?? Agent._createEmptyState(model.id as AgentId);
    const items = options.items ?? [];
    Agent.fixState(state, meta);

    super(location, model.name, meta, state, items);

    this.reloadCore();

    for (const llm of meta.llms) {
      const llmOptions = {
        ...llm,
        apiKey: llm.apiKey ?? location.apiKeys[llm.platform]?.key,
      };
      if (llmOptions.apiKey) {
        const llmService = LlmFactory.create(llmOptions);
        this.llms.push(llmService);
      }
    }
    for (const input of meta.inputs) {
      this.inputs.push(AgentInputFactory.createInput(input, location, this));
    }
    const actions = [
      ...(this.llms.at(Agent.ACTION_LLM_INDEX)?.reasoning
        ? []
        : ['reasoning:latest']),
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
    this._meta = {
      ...value,
      ...(this.model.meta as object),
      ...((this.location.meta.agentMetas[this.id] as object) ?? {}),
    };
  }

  public override get state(): AgentState {
    return super.state as AgentState;
  }

  public set state(value: AgentState) {
    this._state = value;
  }

  public override get context(): AgentContext {
    const entityState = this.location.getEntityState(this.key);
    const canvases = [...this.location.meta.agentCanvases];
    for (const gimmick of Object.values(this.location.gimmicks)) {
      const gimmickCanvas = gimmick.core.canvas;
      if (gimmickCanvas) {
        canvases.push(gimmickCanvas);
      }
    }
    const context = new AgentContext({
      ...super.context,
      handle: this.model.username ?? undefined,
      canvases: entityState
        ? canvases.map((c) => {
            const canvas = entityState.canvases[c.name];
            return new EntityCanvasContext({
              name: c.name,
              description: c.description,
              maxLength: c.maxLength,
              lastModifiedAt: canvas.updatedAt,
              text: canvas.text,
            });
          })
        : [],
      summary: this.state.summary,
    });
    return context;
  }

  public get memories(): AgentMemory[] {
    return this.state.memories;
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

  public override fixLocationEntityState(
    state: LocationEntityState
  ): LocationEntityState {
    const canvases = [...this.location.meta.agentCanvases];
    for (const gimmick of Object.values(this.location.gimmicks)) {
      const gimmickCanvas = gimmick.core.canvas;
      if (gimmickCanvas) {
        canvases.push(gimmickCanvas);
      }
    }

    for (const canvas of canvases) {
      if (!state.canvases[canvas.name]) {
        state.canvases[canvas.name] = {
          text: '',
          updatedAt: new Date(),
          createdAt: new Date(),
        };
      }
    }

    for (const name of Object.keys(state.canvases)) {
      if (!canvases.some((c) => c.name === name)) {
        delete state.canvases[name];
      }
    }
    return state;
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

  public reloadCore(): void {
    if (this.core && this.core.name === this.meta.core) {
      return;
    }
    this.core = AgentCoreFactory.createCore(this);
  }

  public async setMemory(index: number, memory: string): Promise<void> {
    if (index < 0 || index >= this.meta.memoryLimit) {
      throw new Error(
        `Invalid memory index: ${index}. Must be between 0 and ${this.meta.memoryLimit - 1}`
      );
    }

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

    if (index < 0 || index >= this.meta.entityMemoryLimit) {
      throw new Error(
        `Invalid entity memory index: ${index}. Must be between 0 and ${this.meta.entityMemoryLimit - 1}`
      );
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
    this.reloadCore();
    if (this.location.getEntityState(this.key)?.isActive === false) {
      if (ENV.DEBUG) {
        console.log(`Skip update for inactive agent ${this.model.name}`);
      }
      return false;
    }
    return await this.core.update();
  }

  private async executeToolCall(
    toolCall: LlmToolCall,
    action?: AgentAction
  ): Promise<void> {
    try {
      action ??= this.actions[toolCall.name];
      await action.execute(toolCall);
    } catch (error) {
      console.error(
        `Error executing tool call:\n${JSON.stringify(toolCall, null, 2)}\n${error}`
      );
    }
  }

  public async executeNextActions(
    inputIndex: number = Agent.ACTION_INPUT_INDEX,
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
        maxReasoningTokens: this.meta.maxReasoningTokens,
        verbose: ENV.DEBUG,
      }
    );
    for (const toolCall of toolCalls) {
      await this.executeToolCall(toolCall);
    }

    await this.location.emitAsync(
      'agentExecutedNextActions',
      this,
      messages,
      toolCalls
    );
  }

  public async evaluateActionCondition(
    inputIndex: number = Agent.EVALUATE_INPUT_INDEX,
    llmIndex: number = Agent.MINI_LLM_INDEX
  ): Promise<boolean> {
    const input = this.inputs[inputIndex];
    const messages = input.buildActionCondition();
    const llm = this.llms.at(llmIndex) ?? this.llms.at(0);
    if (!llm) {
      throw new Error('No LlmService found');
    }
    const result = await llm.generate(messages, {
      maxTokens: this.meta.maxTokens,
      temperature: this.meta.temperature,
      maxReasoningTokens: this.meta.maxReasoningTokens,
      verbose: false,
    });
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.model.name} evaluated action condition: ${result}`
      );
    }
    return result.toString().toLowerCase().includes('true');
  }

  public async executeMemoryActions(
    inputMessages: LlmMessage[],
    prevToolCalls: LlmToolCall[],
    inputIndex: number = Agent.MEMORY_INPUT_INDEX,
    llmIndex: number = Agent.MEMORY_LLM_INDEX
  ): Promise<void> {
    const input = this.inputs[inputIndex];
    const messages = input.buildNextMemoryActions(inputMessages, prevToolCalls);
    const llm = this.llms.at(llmIndex) ?? this.llms.at(0);
    if (!llm) {
      throw new Error('No LlmService found');
    }

    const memoryActions = [
      ...(llm.reasoning ? [] : ['reasoning:latest']),
      ...this.meta.memoryActions,
    ];
    const actions = Object.fromEntries(
      memoryActions.map((actionWithVersion) => {
        const action = AgentActionFactory.createAction(
          actionWithVersion,
          this.location,
          this
        );
        return [action.name, action];
      })
    );

    const toolCalls = await llm.useTools(messages, Object.values(actions), {
      maxTokens: this.meta.maxTokens,
      maxReasoningTokens: this.meta.maxReasoningTokens,
      verbose: ENV.DEBUG,
    });
    for (const toolCall of toolCalls) {
      const action = actions[toolCall.name];
      if (!action) {
        console.error(
          `Agent ${this.model.name} executed memory action with unknown tool call: ${toolCall.name}`
        );
        continue;
      }
      await this.executeToolCall(toolCall, action);
    }
  }
}
