import { ENV } from '@little-samo/samo-ai/common';

import type { Agent } from '../agent';
import { EntityType } from '../../entity.types';

import { RegisterAgentCore } from './agent.core-decorator';
import { AgentCore } from './agent.core';

@RegisterAgentCore('response_every_message')
export class AgentResponseEveryMessageCore extends AgentCore {
  public constructor(agent: Agent) {
    super(agent);
  }

  public async update(): Promise<boolean> {
    const lastMessage =
      this.agent.location.messagesState.messages[
        this.agent.location.messagesState.messages.length - 1
      ];
    if (
      lastMessage &&
      lastMessage.entityType === EntityType.Agent &&
      lastMessage.entityId === this.agent.id
    ) {
      if (ENV.DEBUG) {
        console.log(
          `Skip update for agent ${this.agent.model.name} (last message is from agent)`
        );
      }
      return false;
    }
    await this.agent.executeNextActions();
    return true;
  }
}
