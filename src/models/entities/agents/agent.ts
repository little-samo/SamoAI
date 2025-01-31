import { AgentModel } from '@prisma/client';

import { Entity } from '../entity';

import { AgentCore } from './cores/agent.core';
import { AgentInput } from './io/agent.input';
import { AgentState } from './states/agent.state';

export class Agent extends Entity {
  public readonly core: AgentCore;

  public input: AgentInput = [];

  public constructor(
    public readonly model: AgentModel,
    initialState: AgentState
  ) {
    super(model.name, initialState);
    this.core = AgentCore.createCore(this);
  }

  public override get state(): AgentState {
    return super.state as AgentState;
  }

  public set state(value: AgentState) {
    this._state = value;
  }

  public async update(): Promise<void> {}
}
