import { Location } from '@models/locations/location';

import { Agent } from '../agent';

import { AgentAction } from './agent.action';
import { AgentActionFactory } from './agent.action-factory';

export const AGENT_ACTION_METADATA_KEY = 'agent:action';

export function RegisterAgentAction(action: string): ClassDecorator {
  return function (target: object) {
    Reflect.defineMetadata(AGENT_ACTION_METADATA_KEY, action, target);
    AgentActionFactory.ACTION_MAP[action] = target as new (
      version: number,
      location: Location,
      agent: Agent
    ) => AgentAction;
  };
}
