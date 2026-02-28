import { ENV, shuffle } from '@little-samo/samo-ai/common';

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

    const actionAgents = agents.filter(
      (agent) => agent.core.name !== 'no_action'
    );

    if (
      this.meta.fast &&
      actionAgents.length === 1 &&
      (lastMessage?.entityType === EntityType.User ||
        this.location.state.pauseUpdateReason ===
          LocationPauseReason.USER_RESUME_UPDATE)
    ) {
      await actionAgents[0].executeNextActions();
      if (this.lastMessage === lastMessage) {
        return this.defaultPauseUpdateDuration;
      }
      return 0;
    }

    const agentLastMessageTimeCache = new Map<string, Date>();
    for (let i = this.location.messages.length - 1; i >= 0; i--) {
      const message = this.location.messages[i];
      if (message.entityType === EntityType.Agent) {
        const agentId = message.entityId.toString();
        if (!agentLastMessageTimeCache.has(agentId)) {
          agentLastMessageTimeCache.set(agentId, new Date(message.createdAt));
        }
      }
    }

    if (!this.meta.sequential) {
      shuffle(agents);
    }

    agents.sort((a, b) => {
      const aLastMessageTime = agentLastMessageTimeCache.get(a.id.toString());
      const bLastMessageTime = agentLastMessageTimeCache.get(b.id.toString());

      if (!aLastMessageTime && !bLastMessageTime) {
        return 0;
      }
      if (!aLastMessageTime) {
        return -1;
      }
      if (!bLastMessageTime) {
        return 1;
      }

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
