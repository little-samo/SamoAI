import { Agent } from '../agent';
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
      lastMessage.targetEntityType === EntityType.Agent &&
      lastMessage.targetEntityId === this.agent.id
    ) {
      return false;
    }
    await this.agent.executeNextActions();
    return true;
  }
}
