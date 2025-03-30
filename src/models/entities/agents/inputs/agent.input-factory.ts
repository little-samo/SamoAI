import type { Location } from '@little-samo/samo-ai/models/locations/location';

import type { Agent } from '../agent';
import type { AgentInputBuilder } from './agent.input';

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
