import { AgentModel } from '@prisma/client';

import { Entity } from '../entity.js';

import { AgentCore } from './cores/agent.core.js';
import { AgentInput } from './io/agent.input.js';

export class Agent extends Entity {
  public readonly core: AgentCore;

  public input: AgentInput = [];

  public constructor(public readonly model: AgentModel) {
    super(model.name);
    this.core = AgentCore.createCore(this);
  }

  public async update(): Promise<void> {}
}
