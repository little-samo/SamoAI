import { Context } from '../context';

import { ItemModel } from './entity.item-model';
import { ItemKey } from './entity.types';

export interface EntityCanvasContextOptions {
  name: string;
  description: string;
  maxLength: number;
  lastModifiedAt: string | Date;
  text: string;
}

export class EntityCanvasContext extends Context {
  public static readonly FORMAT =
    'NAME\tDESCRIPTION\tMAX_LENGTH\tLAST_MODIFIED_AT\tTEXT';

  public readonly name: string;
  public readonly description: string;
  public readonly maxLength: number;
  public readonly lastModifiedAt: number;
  public readonly text: string;

  public constructor(options: EntityCanvasContextOptions) {
    super();
    this.name = options.name;
    this.description = options.description;
    this.maxLength = options.maxLength;
    this.lastModifiedAt = Math.floor(
      new Date(options.lastModifiedAt).getTime() / 1000
    );
    this.text = options.text;
  }

  public build(): string {
    return `${this.name}\t${this.description}\t${this.maxLength}\t${this.lastModifiedAt}\t${this.text}`;
  }
}

export interface EntityContextOptions {
  key: string;
  handle?: string;
  name: string;
  appearance: string;
  expression?: string;
  items: Record<ItemKey, ItemModel>;
  canvases: EntityCanvasContext[];
}

export class EntityContext extends Context implements EntityContextOptions {
  public static readonly FORMAT = 'KEY\tHANDLE\tNAME\tAPPEARANCE\tEXPRESSION';

  public readonly key: string;
  public readonly handle?: string;
  public readonly name: string;
  public readonly appearance: string;
  public readonly expression?: string;

  public readonly items: Record<ItemKey, ItemModel>;
  public readonly canvases: EntityCanvasContext[];

  public constructor(options: EntityContextOptions) {
    super();
    this.key = options.key;
    this.handle = options.handle;
    this.name = options.name;
    this.appearance = options.appearance;
    this.expression = options.expression;
    this.items = options.items;
    this.canvases = options.canvases;
  }

  public build(): string {
    let handle = 'null';
    if (this.handle) {
      handle = `@${this.handle}`;
    }
    const expression = this.expression ?? 'null';
    return `${this.key}\t${handle}\t${JSON.stringify(this.name)}\t${JSON.stringify(this.appearance)}\t${JSON.stringify(expression)}`;
  }
}
