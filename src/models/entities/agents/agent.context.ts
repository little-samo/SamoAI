import { Context } from '../../context';
import { EntityContext, EntityContextOptions } from '../entity.context';

export interface AgentMemoryContextOptions {
  index: number;
  memory: string;
  createdAt?: string | Date;
}

export class AgentMemoryContext extends Context {
  public static readonly FORMAT = 'INDEX\tTIMESTAMP\tMEMORY';

  public readonly index: number;
  public readonly memory: string;
  public readonly createdAt?: number;

  public constructor(options: AgentMemoryContextOptions) {
    super();
    this.index = options.index;
    this.memory = options.memory;
    this.createdAt = options.createdAt
      ? Math.floor(new Date(options.createdAt).getTime() / 1000)
      : undefined;
  }

  public build(): string {
    return `${this.index}\t${this.createdAt ?? ''}\t${JSON.stringify(this.memory)}`;
  }
}

export interface AgentEntityMemoryContextOptions {
  index: number;
  memory: string;
  createdAt?: string | Date;
}

export class AgentEntityMemoryContext extends Context {
  public static readonly FORMAT = 'INDEX\tTIMESTAMP\tMEMORY';

  public readonly index: number;
  public readonly memory: string;
  public readonly createdAt?: number;

  public constructor(options: AgentEntityMemoryContextOptions) {
    super();
    this.index = options.index;
    this.memory = options.memory;
    this.createdAt = options.createdAt
      ? Math.floor(new Date(options.createdAt).getTime() / 1000)
      : undefined;
  }

  public build(): string {
    return `${this.index}\t${this.createdAt ?? ''}\t${JSON.stringify(this.memory)}`;
  }
}

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
