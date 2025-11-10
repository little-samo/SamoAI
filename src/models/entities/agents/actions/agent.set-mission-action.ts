import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentSetMissionActionParameters {
  mainMission: string;
  objectives: string[];
}

@RegisterAgentAction('set_mission')
export class AgentSetMissionAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Set or update the location mission (shared by all agents). Specify the main mission and all objectives at once. This will replace any existing mission. Use this when you want to establish a clear goal with actionable objectives.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          mainMission: z
            .string()
            .max(500)
            .describe(
              'Clear description of the main mission (max 500 chars). This should be a specific, achievable goal shared by all agents in this location.'
            ),
          objectives: z
            .array(z.string().max(300))
            .min(1)
            .max(20)
            .describe(
              'List of specific objectives needed to achieve the main mission (1-20 objectives, each max 300 chars). Each objective should be a clear, measurable step.'
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentSetMissionActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} set mission: ${action.mainMission} with ${action.objectives.length} objectives`
      );
    }

    const now = new Date();
    const newMission = {
      mainMission: action.mainMission,
      objectives: action.objectives.map((objectiveDesc) => ({
        description: objectiveDesc,
        completed: false,
        createdAt: now,
      })),
      createdAt: now,
      updatedAt: now,
    };

    await this.location.addAgentMessage(this.agent, {
      action: `set_mission --main ${JSON.stringify(action.mainMission)}`,
    });

    await this.location.setMission(newMission);
  }
}
