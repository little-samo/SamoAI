import { Location } from '@models/locations/location';

import { Agent } from '../agent';
import { AgentOutput } from '../io/agent.output';

import { AgentReasoningAction } from './agent.reasoning-action';
import { AgentSendCasualMessageAction } from './agent.send-casual-message-action';
import { AgentSendMessageAction } from './agent.send-message-action';
import { AgentUpdateMemoryAction } from './agent.update-memory';

export abstract class AgentAction {
  public static readonly ACTION_TYPE: string;

  public static ACTION_MAP: Record<string, typeof AgentAction> = {
    [AgentReasoningAction.ACTION_TYPE]: AgentReasoningAction,
    [AgentSendCasualMessageAction.ACTION_TYPE]: AgentSendCasualMessageAction,
    [AgentSendMessageAction.ACTION_TYPE]: AgentSendMessageAction,
    [AgentUpdateMemoryAction.ACTION_TYPE]: AgentUpdateMemoryAction,
  };

  public static getActionDescription(
    action: string,
    location: Location,
    agent: Agent
  ): string {
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
    return ActionClass.getDescription(version, location, agent);
  }

  protected static getDescription(
    _version: number,
    _location: Location,
    _agent: Agent
  ): string {
    throw new Error('Not implemented');
  }

  public static getActionSchema(
    action: string,
    location: Location,
    agent: Agent
  ): string {
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
    return ActionClass.getSchema(version, location, agent);
  }

  protected static getSchema(
    _version: number,
    _location: Location,
    _agent: Agent
  ): string {
    throw new Error('Not implemented');
  }

  public static execute(
    location: Location,
    agent: Agent,
    output: AgentOutput
  ): Promise<void> {
    const ActionClass = this.ACTION_MAP[output.action];
    if (!ActionClass) {
      throw new Error(`Unknown action type: ${output.action}`);
    }
    return ActionClass.execute(location, agent, output);
  }
}
