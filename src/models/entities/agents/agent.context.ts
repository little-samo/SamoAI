import { EntityContext } from '@models/entities/entity.context';

export interface AgentContext extends EntityContext {}

export interface AgentSelfContext extends AgentContext {
  memories: string[];
}

export interface AgentOtherContext extends AgentContext {
  memories: string[];
}
