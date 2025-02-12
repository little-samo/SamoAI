import { Location } from '@models/locations/location';
import { LlmMessage } from '@common/llms/llm.service';

import { Agent } from '../agent';

export abstract class AgentInputBuilder {
  protected constructor(
    public readonly location: Location,
    public readonly agent: Agent
  ) {}

  public abstract build(): LlmMessage[];
}
