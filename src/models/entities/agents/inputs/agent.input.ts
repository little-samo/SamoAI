import {
  LlmMessage,
  LlmMessageTextContent,
  LlmMessageContent,
} from '@little-samo/samo-ai/common';
import { type Location } from '@little-samo/samo-ai/models';

import { Agent } from '../agent';

export abstract class AgentInputBuilder {
  protected static mergeMessageContents(
    userContents: LlmMessageContent[],
    separator: string = '\n\n'
  ): LlmMessageContent[] {
    const mergedContents: LlmMessageContent[] = [];
    for (const content of userContents) {
      if (content.type === 'image') {
        mergedContents.push(content);
      } else {
        const text = content.text.trim();
        if (
          mergedContents.length > 0 &&
          mergedContents[mergedContents.length - 1].type === 'text'
        ) {
          (
            mergedContents[mergedContents.length - 1] as LlmMessageTextContent
          ).text += `${separator}${text}`;
        } else {
          mergedContents.push(content);
        }
      }
    }
    return mergedContents;
  }

  protected constructor(
    public readonly version: number,
    public readonly location: Location,
    public readonly agent: Agent
  ) {}

  public abstract build(options?: object): LlmMessage[];
}
