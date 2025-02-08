import { ENV } from '@common/config';
import { Location } from '@models/locations/location';

import { Agent } from '../agent';
import { AgentOutput } from '../io/agent.output';

import { AgentAction } from './agent.action';

export interface AgentSendMessageActionOutput extends AgentOutput {
  message: string;
  expression: string;
}

export class AgentSendMessageAction extends AgentAction {
  public static override readonly ACTION_TYPE = 'SEND_MESSAGE';

  public static override getDescription(
    version: number,
    _location: Location,
    _agent: Agent
  ): string {
    switch (version) {
      case 1:
      default:
        return 'Send a message.';
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
  "message": string (max ${location.meta.messageLengthLimit} characters), // The message you want to send. Visible to others.
  "expression": string (optional, max ${location.meta.messageLengthLimit} characters) // Your outward expressions, such as facial expressions and gestures. Visible to others.
}
  `;
    }
  }

  public static override async execute(
    location: Location,
    agent: Agent,
    output: AgentOutput
  ): Promise<void> {
    const action = output as AgentSendMessageActionOutput;
    if (ENV.DEBUG) {
      console.log(`Agent ${agent.name} says: ${action.message}`);
    }

    location.addAgentMessage(agent, action.message, action.expression);
  }
}
