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
        return 'Set location mission with objectives. Replaces existing mission.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          mainMission: z
            .string()
            .max(200)
            .describe('Main goal (max 200 chars).'),
          objectives: z
            .array(z.string().max(200))
            .min(1)
            .max(5)
            .describe('1-5 specific objectives (each max 200 chars).'),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentSetMissionActionParameters;

    // Validate main mission length
    if (action.mainMission.length > 200) {
      throw new Error(
        `Main mission exceeds maximum length of 200 characters (current: ${action.mainMission.length})`
      );
    }

    // Validate objectives count
    if (action.objectives.length < 1 || action.objectives.length > 5) {
      throw new Error(
        `Number of objectives must be between 1 and 5 (current: ${action.objectives.length})`
      );
    }

    // Validate each objective length
    for (let i = 0; i < action.objectives.length; i++) {
      if (action.objectives[i].length > 200) {
        throw new Error(
          `Objective at index ${i} exceeds maximum length of 200 characters (current: ${action.objectives[i].length})`
        );
      }
    }

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
