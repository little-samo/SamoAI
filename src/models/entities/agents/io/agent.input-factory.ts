import { Location } from '@models/locations/location';

import { Agent } from '../agent';

import { AgentInputBuilder } from './agent.input';
import { AgentCharacterInputBuilder } from './agent.character-input';

export class AgentInputFactory {
  private static readonly INPUT_MAP: Record<
    string,
    new (location: Location, agent: Agent) => AgentInputBuilder
  > = {
    character: AgentCharacterInputBuilder,
  };

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
