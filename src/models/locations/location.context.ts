import { Context } from '../context';

import type { EntityKey } from '../entities';

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
    'CREATED\tENTITY_KEY\tTARGET_KEY\tNAME\tMESSAGE\tEXPRESSION\tACTION';

  public readonly key: EntityKey;
  public readonly targetKey?: EntityKey;
  public readonly name: string;
  public readonly message?: string;
  public readonly expression?: string;
  public readonly action?: string;
  public readonly image?: string;
  public readonly created: Date;

  public constructor(options: LocationMessageContextOptions) {
    super();

    this.key = options.key;
    this.targetKey = options.targetKey;
    this.name = options.name;
    this.message = options.message;
    this.expression = options.expression;
    this.action = options.action;
    this.image = options.image;
    this.created = new Date(options.created);
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
    return `${this.created.toISOString()}\t${this.key}\t${targetKey}\t${JSON.stringify(this.name)}\t${message}\t${expression}\t${action}`;
  }
}

export interface LocationCanvasContextOptions {
  name: string;
  description: string;
  maxLength: number;
  lastModeifierKey: EntityKey;
  lastModifiedAt: string | Date;
  text: string;
}

export class LocationCanvasContext extends Context {
  public static readonly FORMAT =
    'NAME\tDESCRIPTION\tMAX_LENGTH\tLAST_MODIFIED_BY\tLAST_MODIFIED\tTEXT';

  public readonly name: string;
  public readonly description: string;
  public readonly maxLength: number;
  public readonly lastModeifierKey: EntityKey;
  public readonly lastModifiedAt: Date;
  public readonly text: string;

  public constructor(options: LocationCanvasContextOptions) {
    super();

    this.name = options.name;
    this.description = options.description;
    this.maxLength = options.maxLength;
    this.lastModeifierKey = options.lastModeifierKey;
    this.lastModifiedAt = new Date(options.lastModifiedAt);
    this.text = options.text;
  }

  public build(): string {
    return `${this.name}\t${this.description}\t${this.maxLength}\t${this.lastModeifierKey}\t${this.lastModifiedAt.toISOString()}\t${this.text}`;
  }
}

export interface LocationContextOptions {
  key: string;
  description: string;
  messages: LocationMessageContext[];
  canvases: LocationCanvasContext[];
}

export class LocationContext extends Context {
  public static readonly FORMAT = 'KEY\tDESCRIPTION';

  public readonly key: string;
  public readonly description: string;

  public readonly messages: LocationMessageContext[];
  public readonly canvases: LocationCanvasContext[];

  public constructor(options: LocationContextOptions) {
    super();

    this.key = options.key;
    this.description = options.description;
    this.messages = options.messages;
    this.canvases = options.canvases;
  }

  public build(): string {
    return `${this.key}\t${JSON.stringify(this.description)}`;
  }
}
