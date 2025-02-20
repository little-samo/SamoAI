import { Location } from '@little-samo/samo-ai/models/locations/location';

import { Agent } from '../agent';

import { AgentAction } from './agent.action';

export class AgentActionFactory {
  public static readonly ACTION_MAP: Record<
    string,
    new (version: number, location: Location, agent: Agent) => AgentAction
  > = {};

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
