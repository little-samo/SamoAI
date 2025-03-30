import type { Location } from '@little-samo/samo-ai/models/locations/location';

import { AgentActionFactory } from './agent.action-factory';

import type { Agent } from '../agent';
import type { AgentAction } from './agent.action';

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
