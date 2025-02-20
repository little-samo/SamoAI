import { ENV, shuffle } from '@little-samo/samo-ai/common';

import { LocationMessage } from '../states/location.messages-state';

import { LocationCore } from './location.core';
import { RegisterLocationCore } from './location.core-decorator';

@RegisterLocationCore('round_robin')
export class LocationRoundRobinCore extends LocationCore {
  public static readonly AGENT_MESSAGE_COOLDOWN = 1000 * 60; // 1 minute
  public static readonly LOCATION_UPDATE_COOLDOWN_ON_MESSAGE = 5 * 1000; // 5 seconds
  public static readonly LOCATION_UPDATE_SHORT_COOLDOWN_ON_NO_MESSAGE =
    1000 * 30; // 30 seconds
  public static readonly LOCATION_UPDATE_LONG_COOLDOWN_ON_NO_MESSAGE = 0; // pause

  private get lastMessage(): LocationMessage | undefined {
    return this.location.messagesState.messages.at(-1);
  }

  public async update(): Promise<number> {
    await super.update();

    const messages = [...this.location.messagesState.messages].reverse();
    const lastMessage = this.lastMessage;
    const agents = shuffle(Object.values(this.location.agents));
    const evaluatedAgentIds: Set<number> = new Set();
    for (const agent of agents) {
      if (lastMessage?.agentId === agent.model.id) {
        continue;
      }
      const agentLastMessage = messages.find(
        (message) => message.agentId === agent.model.id
      );
      if (
        !agentLastMessage ||
        Date.now() - new Date(agentLastMessage.createdAt).getTime() >
          LocationRoundRobinCore.AGENT_MESSAGE_COOLDOWN
      ) {
        evaluatedAgentIds.add(agent.model.id);
        if (!(await agent.evaluateActionCondition())) {
          if (ENV.DEBUG) {
            console.log(`Agent ${agent.name} did not execute next actions`);
          }
          continue;
        }

        await agent.executeNextActions();
        if (lastMessage !== this.lastMessage) {
          return LocationRoundRobinCore.LOCATION_UPDATE_COOLDOWN_ON_MESSAGE;
        }
      }
    }

    for (const agent of agents) {
      if (lastMessage?.agentId === agent.model.id) {
        continue;
      }
      if (evaluatedAgentIds.has(agent.model.id)) {
        continue;
      }
      if (!(await agent.evaluateActionCondition())) {
        if (ENV.DEBUG) {
          console.log(`Agent ${agent.name} did not execute next actions`);
        }
        continue;
      }

      await agent.executeNextActions();
      if (lastMessage !== this.lastMessage) {
        return LocationRoundRobinCore.LOCATION_UPDATE_COOLDOWN_ON_MESSAGE;
      }
    }

    if (!lastMessage) {
      return LocationRoundRobinCore.LOCATION_UPDATE_LONG_COOLDOWN_ON_NO_MESSAGE;
    }
    if (
      Date.now() - new Date(lastMessage.createdAt).getTime() <
      LocationRoundRobinCore.LOCATION_UPDATE_SHORT_COOLDOWN_ON_NO_MESSAGE
    ) {
      return LocationRoundRobinCore.LOCATION_UPDATE_SHORT_COOLDOWN_ON_NO_MESSAGE;
    }

    return LocationRoundRobinCore.LOCATION_UPDATE_LONG_COOLDOWN_ON_NO_MESSAGE;
  }
}
