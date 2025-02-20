import { Location } from '@little-samo/samo-ai/models/locations/location';

import { Agent } from '../agent';

import { AgentInputBuilder } from './agent.input';
import { AgentInputFactory } from './agent.input-factory';

export const AGENT_INPUT_METADATA_KEY = 'agent:input';

export function RegisterAgentInput(input: string): ClassDecorator {
  return function (target: object) {
    Reflect.defineMetadata(AGENT_INPUT_METADATA_KEY, input, target);
    AgentInputFactory.INPUT_MAP[input] = target as new (
      location: Location,
      agent: Agent
    ) => AgentInputBuilder;
  };
}
