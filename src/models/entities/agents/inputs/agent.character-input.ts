import { LlmMessage } from '@common/llms/llm.service';
import { Location } from '@models/locations/location';

import { Agent } from '../agent';

import { AgentInputBuilder } from './agent.input';

export class AgentCharacterInputBuilder extends AgentInputBuilder {
  public static override readonly INPUT_TYPE = 'character';

  public constructor(location: Location, agent: Agent) {
    super(location, agent);
  }

  public build(): LlmMessage[] {
    // TODO
    return [];
  }
}
