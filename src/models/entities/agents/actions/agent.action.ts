import { Location } from '@models/locations/location';
import { LlmTool, LlmToolCall } from '@common/llms/llm.tool';
import { z } from 'zod';

import { Agent } from '../agent';

import { AgentSendCasualMessageAction } from './agent.send-casual-message-action';
import { AgentSendMessageAction } from './agent.send-message-action';
import { AgentUpdateMemoryAction } from './agent.update-memory';
import { AgentUpdateEntityMemoryAction } from './agent.update-entity-memory';

export abstract class AgentAction implements LlmTool {
  public static readonly ACTION_TYPE: string;

  public static ACTION_MAP: Record<
    string,
    new (version: number, location: Location, agent: Agent) => AgentAction
  > = {
    [AgentSendCasualMessageAction.ACTION_TYPE]: AgentSendCasualMessageAction,
    [AgentSendMessageAction.ACTION_TYPE]: AgentSendMessageAction,
    [AgentUpdateEntityMemoryAction.ACTION_TYPE]: AgentUpdateEntityMemoryAction,
    [AgentUpdateMemoryAction.ACTION_TYPE]: AgentUpdateMemoryAction,
  };

  public static createAction(
    action: string,
    location: Location,
    agent: Agent
  ): AgentAction {
    let version = 0;
    const actionMatch = action.match(/^(\w+):(\d+)$/);
    if (actionMatch) {
      action = actionMatch[1];
      version = parseInt(actionMatch[2]);
    }

    const ActionClass = this.ACTION_MAP[action];
    if (!ActionClass) {
      throw new Error(`Unknown action type: ${action}`);
    }
    return new ActionClass(version, location, agent);
  }

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
