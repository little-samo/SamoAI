import { EntityKey } from '@models/entities/entity';
import { Context } from '@models/context';

export interface LocationMessageContextOptions {
  key: EntityKey;
  name: string;
  message?: string;
  expression?: string;
  created: number;
}

export class LocationMessageContext
  extends Context
  implements LocationMessageContextOptions
{
  public static readonly FORMAT = 'TIMESTAMP\tENTITY_KEY\tNAME\tMESSAGE';

  public readonly key: EntityKey;
  public readonly name: string;
  public readonly message?: string;
  public readonly expression?: string;
  public readonly created: number;

  public constructor(options: LocationMessageContextOptions) {
    super();

    this.key = options.key;
    this.name = options.name;
    this.message = options.message;
    this.expression = options.expression;
    this.created = options.created;
  }

  public build(): string {
    const message = this.message ?? `*${this.expression}*`;
    return `${this.created}\t${this.key}\t${JSON.stringify(this.name)}\t${JSON.stringify(message)}`;
  }
}

export interface LocationContextOptions {
  key: string;
  description: string;
  messages: LocationMessageContext[];
}

export class LocationContext extends Context {
  public static readonly FORMAT = 'KEY\tDESCRIPTION';

  public readonly key: string;
  public readonly description: string;

  public readonly messages: LocationMessageContext[];

  public constructor(options: LocationContextOptions) {
    super();

    this.key = options.key;
    this.description = options.description;
    this.messages = options.messages;
  }

  public build(): string {
    return `${this.key}\t${JSON.stringify(this.description)}`;
  }
}
