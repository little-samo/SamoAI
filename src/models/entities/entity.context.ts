import { Context } from '../context';

export interface EntityContextOptions {
  key: string;
  handle?: string;
  name: string;
  appearance: string;
  expression?: string;
}

export class EntityContext extends Context implements EntityContextOptions {
  public static readonly FORMAT = 'KEY\tHANDLE\tNAME\tAPPEARANCE\tEXPRESSION';

  public readonly key: string;
  public readonly handle?: string;
  public readonly name: string;
  public readonly appearance: string;
  public readonly expression?: string;

  public constructor(options: EntityContextOptions) {
    super();
    this.key = options.key;
    this.handle = options.handle;
    this.name = options.name;
    this.appearance = options.appearance;
    this.expression = options.expression;
  }

  public build(): string {
    let handle = '';
    if (this.handle) {
      handle = `@${this.handle}`;
    }
    const expression = this.expression ?? '';
    return `${this.key}\t${handle}\t${JSON.stringify(this.name)}\t${JSON.stringify(this.appearance)}\t${JSON.stringify(expression)}`;
  }
}
