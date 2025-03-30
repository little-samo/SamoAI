import {
  LlmTool,
  LlmToolCall,
} from '@little-samo/samo-ai/common/llms/llm.tool';
import { Location } from '@little-samo/samo-ai/models/locations/location';
import { z } from 'zod';

import { AGENT_ACTION_METADATA_KEY } from './agent.action-decorator';

import type { Agent } from '../agent';

export abstract class AgentAction implements LlmTool {
  public constructor(
    public readonly version: number,
    public readonly location: Location,
    public readonly agent: Agent
  ) {}

  public get name(): string {
    return Reflect.getMetadata(AGENT_ACTION_METADATA_KEY, this.constructor);
  }

  public abstract get description(): string;
  public abstract get parameters(): z.ZodSchema;

  public abstract execute(call: LlmToolCall): Promise<void>;
}
