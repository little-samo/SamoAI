import { Context } from '../context';
import { EntityKey } from '../entities';

export interface LocationMessageContextOptions {
  key: EntityKey;
  targetKey?: EntityKey;
  name: string;
  message?: string;
  expression?: string;
  action?: string;
  image?: string;
  created: string | Date;
}

export class LocationMessageContext extends Context {
  public static readonly FORMAT =
    'TIMESTAMP\tENTITY_KEY\tTARGET_KEY\tNAME\tMESSAGE\tEXPRESSION\tACTION';

  public readonly key: EntityKey;
  public readonly targetKey?: EntityKey;
  public readonly name: string;
  public readonly message?: string;
  public readonly expression?: string;
  public readonly action?: string;
  public readonly image?: string;
  public readonly created: number;

  public constructor(options: LocationMessageContextOptions) {
    super();

    this.key = options.key;
    this.targetKey = options.targetKey;
    this.name = options.name;
    this.message = options.message;
    this.expression = options.expression;
    this.action = options.action;
    this.image = options.image;
    this.created = Math.floor(new Date(options.created).getTime() / 1000);
  }

  public build(): string {
    const targetKey = this.targetKey ?? 'null';
    const message = this.message ? JSON.stringify(this.message) : 'null';
    const expression = this.expression
      ? JSON.stringify(this.expression)
      : 'null';
    let action = this.action ? JSON.stringify(this.action) : 'null';
    if (this.image) {
      action = `UPLOAD_IMAGE`;
    }
    return `${this.created}\t${this.key}\t${targetKey}\t${JSON.stringify(this.name)}\t${message}\t${expression}\t${action}`;
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
