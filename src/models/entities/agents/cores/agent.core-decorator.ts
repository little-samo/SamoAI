import type { Agent } from '../agent';

import { AgentCoreFactory } from './agent.core-factory';
import type { AgentCore } from './agent.core';
import { AGENT_CORE_METADATA_KEY } from './agent.core-constants';

export function RegisterAgentCore(core: string): ClassDecorator {
  return function (target: object) {
    Reflect.defineMetadata(AGENT_CORE_METADATA_KEY, core, target);
    AgentCoreFactory.CORE_MAP[core] = target as new (agent: Agent) => AgentCore;
  };
}
