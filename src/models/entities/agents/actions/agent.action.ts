import { Location } from '@models/locations/location';
import { LlmTool, LlmToolCall } from '@common/llms/llm.tool';
import { z } from 'zod';

import { Agent } from '../agent';

export abstract class AgentAction implements LlmTool {
  public static readonly ACTION_TYPE: string;

  public constructor(
    public readonly version: number,
    public readonly location: Location,
    public readonly agent: Agent
  ) {}

  public get name(): string {
    return (this.constructor as typeof AgentAction).ACTION_TYPE;
  }

  public abstract get description(): string;
  public abstract get parameters(): z.ZodSchema;

  public abstract execute(call: LlmToolCall): Promise<void>;
}
