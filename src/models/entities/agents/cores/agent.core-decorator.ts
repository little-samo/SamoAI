import { Agent } from '../agent';

import { AgentCoreFactory } from './agent.core-factory';
import { AgentCore } from './agent.core';

export const AGENT_CORE_METADATA_KEY = 'agent:core';

export function RegisterAgentCore(core: string): ClassDecorator {
  return function (target: object) {
    Reflect.defineMetadata(AGENT_CORE_METADATA_KEY, core, target);
    AgentCoreFactory.CORE_MAP[core] = target as new (agent: Agent) => AgentCore;
  };
}
