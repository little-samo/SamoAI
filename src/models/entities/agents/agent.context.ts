import { Context } from '../../context';
import { EntityContext, type EntityContextOptions } from '../entity.context';

import type { ItemKey } from '../entity.types';

export interface AgentMemoryContextOptions {
  index: number;
  memory: string;
  createdAt?: string | Date;
}

export class AgentMemoryContext extends Context {
  public static readonly FORMAT = 'INDEX\tCREATED\tMEMORY';

  public readonly index: number;
  public readonly memory: string;
  public readonly createdAt?: Date;

  public constructor(options: AgentMemoryContextOptions) {
    super();
    this.index = options.index;
    this.memory = options.memory;
    this.createdAt = options.createdAt
      ? new Date(options.createdAt)
      : undefined;
  }

  public build(): string {
    return `${this.index}\t${this.createdAt?.toISOString() ?? 'null'}\t${JSON.stringify(this.memory)}`;
  }
}

export interface AgentEntityMemoryContextOptions {
  index: number;
  memory: string;
  createdAt?: string | Date;
}

export class AgentEntityMemoryContext extends Context {
  public static readonly FORMAT = 'INDEX\tCREATED\tMEMORY';

  public readonly index: number;
  public readonly memory: string;
  public readonly createdAt?: Date;

  public constructor(options: AgentEntityMemoryContextOptions) {
    super();
    this.index = options.index;
    this.memory = options.memory;
    this.createdAt = options.createdAt
      ? new Date(options.createdAt)
      : undefined;
  }

  public build(): string {
    return `${this.index}\t${this.createdAt?.toISOString() ?? 'null'}\t${JSON.stringify(this.memory)}`;
  }
}

export interface AgentItemContextOptions {
  key: ItemKey;
  name: string;
  description: string;
  count: number;
}

export class AgentItemContext extends Context {
  public static readonly FORMAT = 'KEY\tNAME\tDESCRIPTION\tCOUNT';

  public readonly key: ItemKey;
  public readonly name: string;
  public readonly description: string;
  public readonly count: number;

  public constructor(options: AgentItemContextOptions) {
    super();
    this.key = options.key;
    this.name = options.name;
    this.description = options.description;
    this.count = options.count;
  }

  public build(): string {
    return `${this.key}\t${this.name}\t${this.description}\t${this.count}`;
  }
}

export interface AgentContextOptions extends EntityContextOptions {
  summary: string;
}
export class AgentContext extends EntityContext implements AgentContextOptions {
  public static readonly FORMAT = EntityContext.FORMAT;

  public readonly summary: string;

  public constructor(options: AgentContextOptions) {
    super(options);
    this.summary = options.summary;
  }

  public build(): string {
    return super.build();
  }
}
