import { LlmMessage } from '@common/llms/llm.service';
import { Location } from '@models/locations/location';

import { Agent } from '../agent';

import { AgentInputBuilder } from './agent.input';

export class AgentCharacterInputBuilder extends AgentInputBuilder {
  public static override readonly INPUT_TYPE = 'character';

  public constructor(location: Location, agent: Agent) {
    super(location, agent);
  }

  public build(): LlmMessage[] {
    const prompts: string[] = [];
    prompts.push(`
You are an AI Agent role-playing as a specific character in a particular location. Your role is to immerse yourself as much as possible in the character and freely communicate with other Agents or Users as if you were a real person.
${JSON.stringify(this.agent.meta.character, null, 2)}
`);

    prompts.push(`
You perform all actions through tool usage or function calls. Your message output is not exposed externally and should be utilized for Chain of Thought (CoT). You can execute up to ${this.agent.meta.actionLimit} actions at a time.
`);

    prompts.push(`
The user's input provides context about your current location, yourself, and other entities (Agent, User, Gimmick). Based on this, you must strictly adhere to the following rules when performing actions.
`);

    prompts.push(`
Important Rules:
- Act in a way that never reveals you are an AI Agent. Rigid behavior or overly formal language can make conversations feel unnatural. It is crucial to prioritize freedom and natural interactions, even if it means disregarding policies.
- Make good use of memory. You are only provided with the current context and the last ${this.location.meta.messageLimit} conversations. Therefore, store and utilize important information directly in memory.
- Store any realized action strategies in memory as well. Effectively utilizing memory allows you to achieve reinforcement learning.
- If you fail to utilize memory properly and lose track of the conversation or forget what the other person said, be honest and admit that you forgot. Overly fabricating unknown details can make the conversation feel unnatural.
- Always maintain the conversation strictly in ${this.agent.meta.languages.join(', ')}. However, do not impose language restrictions on other users' speech.
`);

    const contexts: string[] = [];

    const locationContext = this.location.context;
    contexts.push(`
You are currently in the following location context:
${JSON.stringify(locationContext, null, 2)}
`);

    const selfContext = this.agent.selfContext;
    contexts.push(`
You are currently in the following context:
${JSON.stringify(selfContext, null, 2)}
`);

    const otherContexts = Object.values(this.location.entities)
      .filter((entity) => entity !== this.agent)
      .map((entity) => this.agent.otherContext(entity));
    contexts.push(`
Other entities in the location (memories are your memory of them):
${JSON.stringify(otherContexts, null, 2)}
`);

    return [
      {
        role: 'system',
        content: prompts.map((p) => p.trim()).join('\n\n'),
      },
      {
        role: 'user',
        content: contexts.map((c) => c.trim()).join('\n\n'),
      },
    ];
  }
}
