import { Context } from '../context';
import { EntityKey } from '../entities';

export interface LocationMessageContextOptions {
  key: EntityKey;
  targetKey?: EntityKey;
  name: string;
  message?: string;
  expression?: string;
  action?: string;
  created: number;
}

export class LocationMessageContext
  extends Context
  implements LocationMessageContextOptions
{
  public static readonly FORMAT =
    'TIMESTAMP\tENTITY_KEY\tTARGET_KEY\tNAME\tMESSAGE';

  public readonly key: EntityKey;
  public readonly targetKey?: EntityKey;
  public readonly name: string;
  public readonly message?: string;
  public readonly expression?: string;
  public readonly action?: string;
  public readonly created: number;

  public constructor(options: LocationMessageContextOptions) {
    super();

    this.key = options.key;
    this.targetKey = options.targetKey;
    this.name = options.name;
    this.message = options.message;
    this.expression = options.expression;
    this.action = options.action;
    this.created = options.created;
  }

  public build(): string {
    const targetKey = this.targetKey ?? '';
    let message: string;
    if (this.message) {
      message = JSON.stringify(this.message);
    } else if (this.expression) {
      message = JSON.stringify(`*${this.expression}*`);
    } else if (this.action) {
      message = `[${this.action}]`;
    } else {
      message = '';
    }
    return `${this.created}\t${this.key}\t${targetKey}\t${JSON.stringify(this.name)}\t${message}`;
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
