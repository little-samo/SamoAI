import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentExecuteCliActionParameters {
  command: string;
}

@RegisterAgentAction('execute_cli')
export class AgentExecuteCliAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return `Executes a CLI command. You must generate the command by precisely following the given instruction in the Rendering.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          command: z.string().describe(`The CLI command to execute.`),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentExecuteCliActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} executes CLI command: ${action.command}`
      );
    }

    await this.location.addAgentMessage(this.agent, {
      action: `EXECUTE_CLI:${JSON.stringify(action.command)}`,
    });
  }
}
