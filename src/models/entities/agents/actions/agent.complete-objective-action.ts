import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentCompleteObjectiveActionParameters {
  objectiveIndex: number;
}

@RegisterAgentAction('complete_objective')
export class AgentCompleteObjectiveAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Mark a mission objective as completed (shared across all agents in location). When all objectives are completed, the main mission will be considered achieved. Use the INDEX from the current mission objectives list.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          objectiveIndex: z
            .number()
            .int()
            .min(0)
            .describe(
              'The INDEX (0-based) of the objective to mark as completed (from the mission objectives list)'
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentCompleteObjectiveActionParameters;

    if (!this.location.state.mission) {
      throw new Error(
        'Cannot complete objective: No mission set. Use set_mission first.'
      );
    }

    const objective =
      this.location.state.mission.objectives[action.objectiveIndex];

    if (!objective) {
      throw new Error(
        `Objective at index ${action.objectiveIndex} not found. Valid range: 0-${this.location.state.mission.objectives.length - 1}`
      );
    }

    if (objective.completed) {
      if (ENV.DEBUG) {
        console.log(
          `Agent ${this.agent.name} tried to complete already completed objective: ${objective.description}`
        );
      }
      return;
    }

    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} completed objective[${action.objectiveIndex}]: ${objective.description}`
      );
    }

    await this.location.addAgentMessage(this.agent, {
      action: `complete_objective --index ${action.objectiveIndex}`,
    });

    await this.location.completeObjective(action.objectiveIndex);
  }
}
