import { EntityContext } from '@models/entities/entity.context';

export interface AgentContext extends EntityContext {}

export interface AgentSelfContext extends AgentContext {
  memory: string[];
}

export interface AgentOtherContext extends AgentContext {
  memory: string[];
}
