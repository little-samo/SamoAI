import type { Location } from '@little-samo/samo-ai/models';

import type { Agent } from '../agent';
import type { AgentInputBuilder } from './agent.input';
import type { AgentInputMeta, AgentInputOptions } from '../agent.meta';

export class AgentInputFactory {
  public static readonly INPUT_MAP: Record<
    string,
    new (
      version: number,
      location: Location,
      agent: Agent,
      options?: AgentInputOptions
    ) => AgentInputBuilder
  > = {};

  public static createInput(
    inputMeta: string | AgentInputMeta,
    location: Location,
    agent: Agent
  ): AgentInputBuilder {
    // Parse input meta (string or object)
    let input: string;
    let options: AgentInputOptions = {};

    if (typeof inputMeta === 'string') {
      input = inputMeta;
    } else {
      input = inputMeta.name;
      options = inputMeta.options ?? {};
    }

    // Parse version from input name
    let version = 0;
    const inputMatch = input.match(/^(\w+):(\w+)$/);
    if (inputMatch) {
      input = inputMatch[1];
      const versionStr = inputMatch[2];
      if (versionStr !== 'latest') {
        version = parseInt(versionStr);
      }
    }

    const InputClass = this.INPUT_MAP[input];
    if (!InputClass) {
      throw new Error(`Unknown input type: ${input}`);
    }
    return new InputClass(version, location, agent, options);
  }
}
