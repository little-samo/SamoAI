import {
  EntityContext,
  EntityContextOptions,
} from '@models/entities/entity.context';

export interface AgentContextOptions extends EntityContextOptions {}

export class AgentContext extends EntityContext implements AgentContextOptions {
  public static readonly FORMAT = EntityContext.FORMAT;

  public constructor(options: AgentContextOptions) {
    super(options);
  }

  public build(): string {
    return super.build();
  }
}
