import { ENV } from '@common/config';
import { Location } from '@models/locations/location';

import { Agent } from '../agent';
import { AgentOutput } from '../io/agent.output';

import { AgentAction } from './agent.action';

export interface AgentUpdateMemoryActionOutput extends AgentOutput {
  index: number;
  memory: string;
}

export class AgentUpdateMemoryAction extends AgentAction {
  public static override readonly ACTION_TYPE = 'UPDATE_MEMORY';

  public static override getDescription(
    version: number,
    _location: Location,
    _agent: Agent
  ): string {
    switch (version) {
      case 1:
      default:
        return 'Update one of your memories.';
    }
  }

  public static override getSchema(
    version: number,
    location: Location,
    agent: Agent
  ): string {
    switch (version) {
      case 1:
      default:
        return `
{
  "action": "${this.ACTION_TYPE}",
  "index": number (0-${agent.meta.memoryLimit - 1}),
  "memory": string (max ${location.meta.messageLengthLimit} characters)
}
  `;
    }
  }

  public static override async execute(
    location: Location,
    agent: Agent,
    output: AgentOutput
  ): Promise<void> {
    const action = output as AgentUpdateMemoryActionOutput;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${agent.name} updated memory at index ${action.index} with value ${action.memory}`
      );
    }

    agent.state.memories[action.index] = action.memory;
  }
}
