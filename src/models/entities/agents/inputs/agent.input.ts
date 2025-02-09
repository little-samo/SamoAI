import { Location } from '@models/locations/location';
import { LlmMessage } from '@common/llms/llm.service';

import { Agent } from '../agent';

import { AgentCharacterInputBuilder } from './agent.character-input';

export abstract class AgentInputBuilder {
  public static readonly INPUT_TYPE: string;

  public static INPUT_MAP: Record<
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

  public constructor(
    public readonly location: Location,
    public readonly agent: Agent
  ) {}

  public abstract build(): LlmMessage[];
}
