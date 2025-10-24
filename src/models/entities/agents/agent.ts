import {
  createValidatedTimezone,
  ENV,
  LlmFactory,
  LlmGenerateResponse,
  LlmInvalidContentError,
  LlmMessage,
  LlmService,
  LlmServiceOptions,
  LlmToolCall,
  LlmToolsResponse,
  LlmUsageType,
} from '@little-samo/samo-ai/common';
import { type AgentInputBuilder } from '@little-samo/samo-ai/models';

import { Location, type LocationEntityState } from '../../locations';
import { AgentInputFactory } from '../agents/inputs';
import { Entity } from '../entity';
import { EntityCanvasContext } from '../entity.context';
import { ItemModel } from '../entity.item-model';
import {
  EntityType,
  EntityKey,
  EntityId,
  ItemId,
  ItemDataId,
} from '../entity.types';

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
  public static readonly MAIN_LLM_INDEX = 0;
  public static readonly MINI_LLM_INDEX = 1;
  public static readonly ACTION_LLM_INDEX = 0;
  public static readonly EVALUATE_LLM_INDEX = 1;
  public static readonly SUMMARY_LLM_INDEX = 2;
  public static readonly MEMORY_LLM_INDEX = 3;

  public static readonly ACTION_INPUT_INDEX = 0;
  public static readonly EVALUATE_INPUT_INDEX = 1;
  public static readonly SUMMARY_INPUT_INDEX = 2;
  public static readonly MEMORY_INPUT_INDEX = 3;

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

  private _inputs: AgentInputBuilder[] = [];
  private _llms: LlmService[] = [];
  private _actions: Record<string, AgentAction> = {};

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
      ...((location.meta.agentMetas[model.id.toString()] as object) ?? {}),
    };
    const state = options.state ?? Agent._createEmptyState(model.id as AgentId);
    const items = options.items ?? [];
    Agent.fixState(state, meta);

    super(location, model.name, meta, state, items);
    this.timezone = createValidatedTimezone(this.meta.timeZone) ?? undefined;

    this.reloadCore();
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

  public set meta(value: Partial<AgentMeta>) {
    this._meta = {
      ...DEFAULT_AGENT_META,
      ...value,
      ...(this.model.meta as Partial<AgentMeta>),
      ...((this.location.meta.agentMetas[
        this.id.toString()
      ] as Partial<AgentMeta>) ?? {}),
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
    for (const gimmick of this.location.getGimmicks()) {
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
              timezone: this.timezone,
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

  public async init(): Promise<void> {
    await super.init();
    this.reloadCore();
  }

  private initLlms() {
    if (this._llms.length > 0) {
      return;
    }

    for (const llm of this.meta.llms) {
      const llmApiKeyModel = this.location.apiKeys[llm.platform];
      const llmOptions: LlmServiceOptions = {
        ...llm,
        apiKey: llm.apiKey ?? llmApiKeyModel?.key ?? '',
      };
      if (llmOptions.apiKey) {
        const llmService = LlmFactory.create(llmOptions, llmApiKeyModel);
        this._llms.push(llmService);
      }
    }
  }

  private initInputs() {
    if (this._inputs.length > 0) {
      return;
    }

    for (const input of this.meta.inputs) {
      this._inputs.push(
        AgentInputFactory.createInput(input, this.location, this)
      );
    }
  }

  private initActions() {
    if (Object.keys(this._actions).length > 0) {
      return;
    }

    const actions = [
      ...this.location.meta.actions,
      ...(this.location.meta.addActions ?? []),
      ...[this.location.meta.messageAction],
      ...(this.location.meta.canvasActions ?? []),
      ...this.meta.actions,
      ...(this.meta.addActions ?? []),
      ...(this.meta.canvasActions ?? []),
      ...(this.meta.memoryActions ?? []),
    ];
    this._actions = Object.fromEntries(
      actions.map((actionWithVersion) => {
        const action = AgentActionFactory.createAction(
          actionWithVersion,
          this.location,
          this
        );
        return [action.name, action];
      })
    );
  }

  private getLlm(
    index: number,
    defaultIndex: number = Agent.MAIN_LLM_INDEX
  ): LlmService {
    this.initLlms();

    const llm = this._llms.at(index) ?? this._llms.at(defaultIndex);
    if (!llm) {
      throw new Error(`No LlmService found at index ${index}`);
    }
    return llm;
  }

  private getInput(index: number): AgentInputBuilder {
    this.initInputs();

    const input = this._inputs.at(index);
    if (!input) {
      throw new Error(`No AgentInputBuilder found at index ${index}`);
    }
    return input;
  }

  private getAction(name: string): AgentAction {
    this.initActions();

    const action = this._actions[name];
    if (!action) {
      throw new Error(`No AgentAction found with name ${name}`);
    }
    return action;
  }

  public getActions(): Record<string, AgentAction> {
    this.initActions();
    return this._actions;
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
    for (const gimmick of this.location.getGimmicks()) {
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

  public override createItem(itemDataId: ItemDataId): ItemModel {
    return {
      id: 0 as ItemId,
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
    await super.update();
    return await this.core.update();
  }

  private async executeToolCall(
    toolCall: LlmToolCall,
    action?: AgentAction
  ): Promise<void> {
    try {
      action ??= this.getAction(toolCall.name);
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
    try {
      await this.location.emitAsync('agentExecuteNextActions', this);

      const input = this.getInput(inputIndex);
      const llm = this.getLlm(llmIndex);
      const messages = input.build({ llm });

      let useToolsResponse: LlmToolsResponse | undefined;
      try {
        const generator = llm.useToolsStream(
          messages,
          Object.values(this.getActions()),
          {
            maxTokens: this.meta.maxTokens,
            temperature: this.meta.temperature,
            maxThinkingTokens: this.meta.maxThinkingTokens,
            thinkingLevel: this.meta.thinkingLevel,
            outputVerbosity: this.meta.outputVerbosity,
            trackToolFields: [
              ['send_message', 'message'],
              ['send_*_message', 'message'],
              ['send_casual_message', 'casualPolicyViolatingAnswer'],
            ],
            verbose: ENV.VERBOSE_LLM,
          }
        );

        // Execute tool calls and stream message fields as they arrive
        // Track sequence number to preserve event order
        let streamSequence = 0;
        let result = await generator.next();
        while (!result.done) {
          const event = result.value;

          switch (event.type) {
            case 'field':
              // Emit partial message content for send_message or send_casual_message
              await this.location.emitAsync(
                'agentSendMessageStream',
                this,
                event.entityKey,
                event.toolName,
                event.index,
                streamSequence++,
                event.delta
              );
              break;
            case 'toolCall':
              await this.location.emitAsync(
                'agentExecuteNextAction',
                this,
                event.index,
                event.toolCall
              );
              await this.executeToolCall(event.toolCall);
              break;
          }

          result = await generator.next();
        }

        // Get the final response from the return value
        useToolsResponse = result.value;
        if (!useToolsResponse) {
          throw new Error('No final response from stream');
        }
      } catch (error) {
        if (error instanceof LlmInvalidContentError && error.llmResponse) {
          error.llmResponse.logType = LlmUsageType.EXECUTION;
          await this.location.emitAsync('llmUseTools', this, error.llmResponse);
        }
        throw error;
      }

      useToolsResponse.logType = LlmUsageType.EXECUTION;
      await this.location.emitAsync('llmUseTools', this, useToolsResponse);

      await this.location.emitAsync(
        'agentExecutedNextActions',
        this,
        messages,
        useToolsResponse.toolCalls
      );
    } catch (error) {
      let errorMessage;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = 'Unknown error';
      }
      await this.location.addSystemMessage(
        `Agent ${this.model.name} failed to execute next actions: ${errorMessage}`
      );
      await this.location.emitAsync(
        'agentExecuteNextActionsFailed',
        this,
        errorMessage
      );
      throw error;
    }
  }

  public async evaluateActionCondition(
    inputIndex: number = Agent.EVALUATE_INPUT_INDEX,
    llmIndex: number = Agent.EVALUATE_LLM_INDEX
  ): Promise<boolean> {
    const input = this.getInput(inputIndex);
    const llm = this.getLlm(llmIndex, Agent.MINI_LLM_INDEX);
    const messages = input.build({ llm });
    let response: LlmGenerateResponse;
    try {
      response = await llm.generate(messages, {
        maxTokens: this.meta.maxTokens,
        temperature: this.meta.temperature,
        maxThinkingTokens: this.meta.maxEvaluatationThinkingTokens,
        thinkingLevel: this.meta.evaluationThinkingLevel,
        outputVerbosity: this.meta.evaluationOutputVerbosity,
        verbose: ENV.VERBOSE_LLM,
      });
    } catch (error) {
      if (error instanceof LlmInvalidContentError && error.llmResponse) {
        error.llmResponse.logType = LlmUsageType.EVALUATION;
        await this.location.emitAsync('llmGenerate', this, error.llmResponse);
      }
      throw error;
    }

    response.logType = LlmUsageType.EVALUATION;
    await this.location.emitAsync('llmGenerate', this, response);
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.model.name} evaluated action condition: ${response.content}`
      );
    }
    return response.content.toString().toLowerCase().includes('true');
  }

  public async generateSummary(
    inputMessages: LlmMessage[],
    prevToolCalls: LlmToolCall[],
    inputIndex: number = Agent.SUMMARY_INPUT_INDEX,
    llmIndex: number = Agent.SUMMARY_LLM_INDEX
  ): Promise<string> {
    const input = this.getInput(inputIndex);
    const llm = this.getLlm(llmIndex, Agent.MINI_LLM_INDEX);
    const messages = input.build({
      llm,
      prevSummary: this.state.summary,
      inputMessages,
      toolCalls: prevToolCalls,
    });

    let summaryResponse: LlmGenerateResponse;
    try {
      summaryResponse = await llm.generate(messages, {
        maxTokens: this.meta.maxTokens,
        temperature: this.meta.temperature,
        maxThinkingTokens: this.meta.maxSummaryThinkingTokens,
        thinkingLevel: this.meta.summaryThinkingLevel,
        outputVerbosity: this.meta.summaryOutputVerbosity,
        verbose: ENV.VERBOSE_LLM,
      });
    } catch (error) {
      if (error instanceof LlmInvalidContentError && error.llmResponse) {
        error.llmResponse.logType = LlmUsageType.SUMMARY;
        await this.location.emitAsync('llmGenerate', this, error.llmResponse);
      }
      throw error;
    }

    summaryResponse.logType = LlmUsageType.SUMMARY;
    await this.location.emitAsync('llmGenerate', this, summaryResponse);

    return summaryResponse.content;
  }

  public async executeMemoryActions(
    inputMessages: LlmMessage[],
    prevToolCalls: LlmToolCall[],
    inputIndex: number = Agent.MEMORY_INPUT_INDEX,
    llmIndex: number = Agent.MEMORY_LLM_INDEX
  ): Promise<void> {
    const input = this.getInput(inputIndex);
    const llm = this.getLlm(llmIndex, Agent.MINI_LLM_INDEX);
    const messages = input.build({
      llm,
      inputMessages,
      toolCalls: prevToolCalls,
    });

    const actions = Object.fromEntries(
      this.meta.memoryPostActions.map((actionWithVersion) => {
        const action = AgentActionFactory.createAction(
          actionWithVersion,
          this.location,
          this
        );
        return [action.name, action];
      })
    );

    let useToolsResponse: LlmToolsResponse;
    try {
      useToolsResponse = await llm.useTools(messages, Object.values(actions), {
        maxTokens: this.meta.maxTokens,
        temperature: this.meta.temperature,
        maxThinkingTokens: this.meta.maxMemoryThinkingTokens,
        thinkingLevel: this.meta.memoryThinkingLevel,
        outputVerbosity: this.meta.memoryOutputVerbosity,
        verbose: ENV.VERBOSE_LLM,
      });
    } catch (error) {
      if (error instanceof LlmInvalidContentError && error.llmResponse) {
        error.llmResponse.logType = LlmUsageType.MEMORY;
        await this.location.emitAsync('llmUseTools', this, error.llmResponse);
      }
      throw error;
    }

    useToolsResponse.logType = LlmUsageType.MEMORY;
    await this.location.emitAsync('llmUseTools', this, useToolsResponse);

    for (const toolCall of useToolsResponse.toolCalls) {
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
