import { ENV } from '@common/config';
import { Location } from '@models/locations/location';
import { LocationMessage } from '@models/locations/states/location.messages-state';

import { Agent } from '../agent';
import { AgentOutput } from '../io/agent.output';

import { AgentAction } from './agent.action';

export interface AgentReasoningActionOutput extends AgentOutput {
  thought: string;
  expression?: string;
}

export class AgentReasoningAction extends AgentAction {
  public static override readonly ACTION_TYPE = 'REASONING';

  public static override getDescription(
    version: number,
    _location: Location,
    _agent: Agent
  ): string {
    switch (version) {
      case 1:
      default:
        return 'Think about the situation. Used for Chain of Thought reasoning.';
    }
  }

  public static override getSchema(
    version: number,
    location: Location,
    _agent: Agent
  ): string {
    switch (version) {
      case 1:
      default:
        return `
{
  "action": "${this.ACTION_TYPE}",
  "thought": string (max 500 characters), // Cannot be visible to others.
  "expression": string (max ${location.meta.messageLengthLimit} characters) // Your outward expressions, such as facial expressions and gestures. Visible to others.
}
  `;
    }
  }

  public static override async execute(
    location: Location,
    agent: Agent,
    output: AgentOutput
  ): Promise<void> {
    const action = output as AgentReasoningActionOutput;
    if (ENV.DEBUG) {
      console.log(`Agent ${agent.name} thinks: ${action.thought}`);
      if (action.expression) {
        console.log(`Agent ${agent.name} expression: ${action.expression}`);
      }
    }
    if (action.expression) {
      const message = new LocationMessage();
      message.agentId = agent.model.id;
      message.name = agent.name;
      message.expression = action.expression;
      location.addMessage(message);
    }
  }
}
