import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentNavigateWebActionParameters {
    destination: string;
}

@RegisterAgentAction('navigate_web')
export class AgentNavigateWebAction extends AgentAction {
    public override get description(): string {
        switch (this.version) {
            case 1:
            default:
                return `Navigate the web browser to the specified URL. Use for moving to different web pages or specific URLs. Supports absolute URLs (https://example.com) and relative paths. ALWAYS use this as a standalone action - never combine with other actions in control_web since navigation requires waiting for page load completion. After navigation, wait for the page to fully load before performing any additional actions.`;
        }
    }

    public override get parameters(): z.ZodSchema {
        switch (this.version) {
            case 1:
            default:
                return z.object({
                    destination: z
                        .string()
                        .describe(
                            `Target URL or path for navigation (e.g., "https://example.com", "/login", "about.html")`
                        ),
                });
        }
    }

    public override async execute(call: LlmToolCall): Promise<void> {
        const action = call.arguments as AgentNavigateWebActionParameters;
        if (ENV.DEBUG) {
            console.log(
                `Agent ${this.agent.name} navigates web browser to: ${action.destination}`
            );
        }

        await this.location.addAgentMessage(this.agent, {
            action: `navigate_web --destination "${action.destination}"`,
        });
    }
} 