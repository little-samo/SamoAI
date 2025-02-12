import { Location } from '@models/locations/location';

import { Agent } from '../agent';

import { AgentInputBuilder } from './agent.input';

export class AgentInputFactory {
  public static readonly INPUT_MAP: Record<
    string,
    new (location: Location, agent: Agent) => AgentInputBuilder
  > = {};

  public static createInput(
    type: string,
    location: Location,
    agent: Agent
  ): AgentInputBuilder {
    const InputClass = this.INPUT_MAP[type];
    if (!InputClass) {
      throw new Error(`Unknown input type: ${type}`);
    }
    return new InputClass(location, agent);
  }
}
