import { Location } from '@models/locations/location';

import { Agent } from '../agent';

import { AgentAction } from './agent.action';
import { AgentSendCasualMessageAction } from './agent.send-casual-message-action';
import { AgentSendMessageAction } from './agent.send-message-action';
import { AgentUpdateMemoryAction } from './agent.update-memory';
import { AgentUpdateEntityMemoryAction } from './agent.update-entity-memory';

export class AgentActionFactory {
  private static readonly ACTION_MAP: Record<
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
    const actionMatch = action.match(/^(\w+):(\w+)$/);
    if (actionMatch) {
      action = actionMatch[1];
      const versionStr = actionMatch[2];
      if (versionStr !== 'latest') {
        version = parseInt(versionStr);
      }
    }

    const ActionClass = this.ACTION_MAP[action];
    if (!ActionClass) {
      throw new Error(`Unknown action type: ${action}`);
    }
    return new ActionClass(version, location, agent);
  }
}
