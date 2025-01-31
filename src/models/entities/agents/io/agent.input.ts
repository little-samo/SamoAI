import { AgentOutput } from './agent.output';

export type AgentInput = AgentInputType[];

export type AgentInputType = AgentInputMessage | AgentOutput;

export interface AgentInputMessage {
  action?: string;
  payload?: string;

  content?: string;
  expression?: string;

  timestamp: Date;
}
