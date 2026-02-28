import {
  formatDateWithValidatedTimezone,
  ValidatedTimezone,
} from '@little-samo/samo-ai/common';

import { truncateString } from '../../common/utils/string';
import { Context } from '../context';

import type { ItemModel } from './entity.item-model';
import type { ItemKey } from './entity.types';

export interface EntityCanvasContextOptions {
  name: string;
  description: string;
  maxLength: number;
  lastModifiedAt: string | Date;
  text: string;
  timezone?: ValidatedTimezone;
}

export class EntityCanvasContext extends Context {
  public static readonly FORMAT =
    'NAME\tDESCRIPTION\tMAX_LENGTH\tLAST_MODIFIED\tTEXT';

  public readonly name: string;
  public readonly description: string;
  public readonly maxLength: number;
  public readonly lastModifiedAt: Date;
  public readonly text: string;
  public readonly timezone?: ValidatedTimezone;

  public constructor(options: EntityCanvasContextOptions) {
    super();
    this.name = options.name;
    this.description = options.description;
    this.maxLength = options.maxLength;
    this.lastModifiedAt = new Date(options.lastModifiedAt);
    this.text = options.text;
    this.timezone = options.timezone;
  }

  public build(options: { truncateLength?: number } = {}): string {
    const formattedLastModifiedAt = formatDateWithValidatedTimezone(
      this.lastModifiedAt,
      this.timezone
    );
    let text = this.text;
    if (options.truncateLength !== undefined) {
      text = truncateString(text, options.truncateLength).text;
    }
    text = JSON.stringify(text);
    return `${this.name}\t${this.description}\t${this.maxLength}\t${formattedLastModifiedAt}\t${text}`;
  }
}

export interface EntityContextOptions {
  key: string;
  handle?: string;
  name: string;
  role?: string;
  appearance: string;
  expression?: string;
  items: Record<ItemKey, ItemModel>;
  canvases: EntityCanvasContext[];
}

export class EntityContext extends Context implements EntityContextOptions {
  public static readonly FORMAT: string =
    'KEY\tHANDLE\tNAME\tROLE\tAPPEARANCE\tEXPRESSION';

  public readonly key: string;
  public readonly handle?: string;
  public readonly name: string;
  public readonly role?: string;
  public readonly appearance: string;
  public readonly expression?: string;

  public readonly items: Record<ItemKey, ItemModel>;
  public readonly canvases: EntityCanvasContext[];

  public constructor(options: EntityContextOptions) {
    super();
    this.key = options.key;
    this.handle = options.handle;
    this.name = options.name;
    this.role = options.role;
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
    return `${this.key}\t${handle}\t${this.name}\t${this.role ?? 'null'}\t${this.appearance}\t${expression}`;
  }
}
