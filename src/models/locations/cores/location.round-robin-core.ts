import { ENV, shuffle } from '@little-samo/samo-ai/common';

import { type AgentId } from '../../entities';
import { EntityType } from '../../entities/entity.types';
import { LocationMessage } from '../states/location.message';

import { LocationCore } from './location.core';
import { RegisterLocationCore } from './location.core-decorator';

@RegisterLocationCore('round_robin')
export class LocationRoundRobinCore extends LocationCore {
  public static readonly LOCATION_UPDATE_COOLDOWN_ON_MESSAGE = 2 * 1000; // 2 seconds
  public static readonly LOCATION_UPDATE_LONG_COOLDOWN_ON_NO_MESSAGE = 0; // pause

  public override get defaultPauseUpdateDuration(): number {
    return LocationRoundRobinCore.LOCATION_UPDATE_COOLDOWN_ON_MESSAGE;
  }

  private get lastMessage(): LocationMessage | undefined {
    return this.location.messages.at(-1);
  }

  public async update(): Promise<number> {
    const lastMessage = this.lastMessage;
    const agents = this.location.getAgents();
    if (!this.meta.sequential) {
      shuffle(agents);
    } else {
      // sort by agent last message time (oldest message first)
      const agentLastMessageTimeCache = new Map<string, Date>();

      // Iterate through messages from newest to oldest to find each agent's last message
      for (let i = this.location.messages.length - 1; i >= 0; i--) {
        const message = this.location.messages[i];
        if (message.entityType === EntityType.Agent) {
          const agentId = message.entityId.toString();
          // Only set if we haven't seen this agent yet (since we're going from newest to oldest)
          if (!agentLastMessageTimeCache.has(agentId)) {
            agentLastMessageTimeCache.set(agentId, new Date(message.createdAt));
          }
        }
      }

      agents.sort((a, b) => {
        const aLastMessageTime = agentLastMessageTimeCache.get(a.id.toString());
        const bLastMessageTime = agentLastMessageTimeCache.get(b.id.toString());

        // If either agent has no messages, put them first
        if (!aLastMessageTime && !bLastMessageTime) return 0;
        if (!aLastMessageTime) return -1;
        if (!bLastMessageTime) return 1;

        // Sort by oldest message first (ascending order)
        return aLastMessageTime.getTime() - bLastMessageTime.getTime();
      });
    }

    const updatedAgentIds: Set<AgentId> = new Set();
    for (const agent of agents) {
      if (
        lastMessage?.entityType == EntityType.Agent &&
        lastMessage.entityId === agent.model.id
      ) {
        continue;
      }

      updatedAgentIds.add(agent.model.id as AgentId);
      if (!(await agent.update()) || this.lastMessage === lastMessage) {
        if (ENV.DEBUG) {
          console.log(`Agent ${agent.name} did not execute next actions`);
        }
        continue;
      }

      return LocationRoundRobinCore.LOCATION_UPDATE_COOLDOWN_ON_MESSAGE;
    }

    for (const agent of agents) {
      if (updatedAgentIds.has(agent.model.id as AgentId)) {
        continue;
      }
      if (!(await agent.update()) || this.lastMessage === lastMessage) {
        if (ENV.DEBUG) {
          console.log(`Agent ${agent.name} did not execute next actions`);
        }
        continue;
      }

      return LocationRoundRobinCore.LOCATION_UPDATE_COOLDOWN_ON_MESSAGE;
    }

    return LocationRoundRobinCore.LOCATION_UPDATE_LONG_COOLDOWN_ON_NO_MESSAGE;
  }
}
