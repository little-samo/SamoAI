import { Context } from '../context';

import { ItemModel } from './entity.item-model';
import { ItemKey } from './entity.types';

export interface EntityContextOptions {
  key: string;
  handle?: string;
  name: string;
  appearance: string;
  expression?: string;
  items: Record<ItemKey, ItemModel>;
}

export class EntityContext extends Context implements EntityContextOptions {
  public static readonly FORMAT = 'KEY\tHANDLE\tNAME\tAPPEARANCE\tEXPRESSION';

  public readonly key: string;
  public readonly handle?: string;
  public readonly name: string;
  public readonly appearance: string;
  public readonly expression?: string;

  public readonly items: Record<ItemKey, ItemModel>;

  public constructor(options: EntityContextOptions) {
    super();
    this.key = options.key;
    this.handle = options.handle;
    this.name = options.name;
    this.appearance = options.appearance;
    this.expression = options.expression;
    this.items = options.items;
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
