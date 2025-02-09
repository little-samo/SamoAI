import { AgentModel, LlmApiKeyModel } from '@prisma/client';
import { LlmService } from '@common/llms/llm.service';
import { Location } from '@models/locations/location';

import { Entity, EntityKey } from '../entity';

import { AgentCore } from './cores/agent.core';
import { AgentState } from './states/agent.state';
import { AgentContext } from './agent.context';
import { AgentMeta, DEFAULT_AGENT_META } from './agent.meta';
import { AgentAction } from './actions/agent.action';
import { AgentEntityState } from './states/agent.entity-state';

export class Agent extends Entity {
  public static createState(model: AgentModel, meta: AgentMeta): AgentState {
    const state = new AgentState();
    state.agentId = model.id;
    state.memories = Array(meta.memoryLimit).fill('');
    state.dirty = true;
    return state;
  }

  public static fixState(state: AgentState, meta: AgentMeta): void {
    if (state.memories.length < meta.memoryLimit) {
      state.memories = state.memories.concat(
        Array(meta.memoryLimit - state.memories.length).fill('')
      );
      state.dirty = true;
    } else if (state.memories.length > meta.memoryLimit) {
      state.memories = state.memories.slice(0, meta.memoryLimit);
      state.dirty = true;
    }
  }

  public readonly key: EntityKey;

  public readonly core: AgentCore;
  public readonly llm: LlmService;
  public readonly llms: LlmService[] = [];
  public readonly actions: Record<string, AgentAction> = {};

  private readonly _entityStates: Record<EntityKey, AgentEntityState> = {};

  public constructor(
    public readonly location: Location,
    public readonly model: AgentModel,
    state?: null | AgentState,
    apiKeys?: LlmApiKeyModel[]
  ) {
    const meta = { ...DEFAULT_AGENT_META, ...(model.meta as object) };
    state ??= Agent.createState(model, meta);
    Agent.fixState(state, meta);

    super(location, model.name, meta, state);
    this.key = `agent:${model.id}` as EntityKey;

    this.core = AgentCore.createCore(this);
    for (const llm of meta.llms) {
      const apiKey = apiKeys?.find((key) => key.platform === llm.platform);
      if (!apiKey) {
        throw new Error(`API key not found for platform: ${llm.platform}`);
      }
      this.llms.push(LlmService.create(llm.platform, llm.model, apiKey.key));
    }
    this.llm = this.llms[0];
    this.actions = Object.fromEntries(
      meta.actions.map((action) => [
        action,
        AgentAction.createAction(action, location, this),
      ])
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
    return super.context as AgentContext;
  }

  public get selfContext(): AgentContext {
    return this.context;
  }

  public addEntityState(key: EntityKey, state: AgentEntityState): void {
    this._entityStates[key] = state;
  }

  public removeEntityState(key: EntityKey): void {
    delete this._entityStates[key];
  }

  public async update(): Promise<void> {}
}
