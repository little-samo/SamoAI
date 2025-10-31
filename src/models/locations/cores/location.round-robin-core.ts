import { ENV } from '@little-samo/samo-ai/common';

import { EntityType } from '../../entities/entity.types';
import { LocationPauseReason } from '../location.constants';
import { LocationMessage } from '../states/location.message';

import { LocationCore } from './location.core';
import { RegisterLocationCore } from './location.core-decorator';

@RegisterLocationCore('round_robin')
export class LocationRoundRobinCore extends LocationCore {
  public static readonly DEFAULT_UPDATE_INTERVAL = 1000; // 1 second

  public override get defaultPauseUpdateDuration(): number {
    return this.meta.interval ?? LocationRoundRobinCore.DEFAULT_UPDATE_INTERVAL;
  }

  private get lastMessage(): LocationMessage | undefined {
    return this.location.messages.at(-1);
  }

  public async update(): Promise<number> {
    const lastMessage = this.lastMessage;
    const agents = this.location.getAgents();

    if (
      this.meta.fast &&
      agents.filter((agent) => agent.core.name !== 'no_action').length === 1 &&
      (lastMessage?.entityType === EntityType.User ||
        this.location.state.pauseUpdateReason ===
          LocationPauseReason.USER_RESUME_UPDATE)
    ) {
      await agents
        .filter((agent) => agent.core.name !== 'no_action')[0]
        .executeNextActions();
      if (this.lastMessage === lastMessage) {
        return this.defaultPauseUpdateDuration;
      }
      return 0;
    }

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
      if (!aLastMessageTime && !bLastMessageTime) {
        return this.meta.sequential ? 0 : Math.random() - 0.5;
      }
      if (!aLastMessageTime) {
        return -1;
      }
      if (!bLastMessageTime) {
        return 1;
      }

      // Sort by oldest message first (ascending order)
      return aLastMessageTime.getTime() - bLastMessageTime.getTime();
    });

    for (const agent of agents) {
      if (!(await agent.update()) || this.lastMessage === lastMessage) {
        if (ENV.DEBUG && agent.core.name !== 'no_action') {
          console.log(`Agent ${agent.name} did not execute next actions`);
        }
        continue;
      }

      return this.defaultPauseUpdateDuration;
    }

    return 0; // stop updating when no actions are available
  }
}
