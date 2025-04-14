import { LlmMessage, LlmToolCall } from '@little-samo/samo-ai/common';
import { Location } from '@little-samo/samo-ai/models/locations/location';

import { Agent } from '../agent';

export abstract class AgentInputBuilder {
  protected constructor(
    public readonly location: Location,
    public readonly agent: Agent
  ) {}

  public abstract buildNextActions(): LlmMessage[];

  public abstract buildActionCondition(): LlmMessage[];

  public abstract buildSummary(
    prevSummary: string,
    inputMessages: LlmMessage[],
    toolCalls: LlmToolCall[]
  ): LlmMessage[];

  public abstract buildNextMemoryActions(
    inputMessages: LlmMessage[],
    toolCalls: LlmToolCall[]
  ): LlmMessage[];
}
