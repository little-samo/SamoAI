import { LlmMessage } from '@little-samo/samo-ai/common/llms/llm.service';
import { Location } from '@little-samo/samo-ai/models/locations/location';

import { Agent } from '../agent';

export abstract class AgentInputBuilder {
  protected constructor(
    public readonly location: Location,
    public readonly agent: Agent
  ) {}

  public abstract buildNextActions(): LlmMessage[];

  public abstract buildActionCondition(): LlmMessage[];
}
