import { EntityContext, EntityContextOptions } from '../entity.context';
import { EntityId, EntityType } from '../entity.types';

export interface GimmickContextOptions extends EntityContextOptions {
  occupierId: EntityId;
  occupierType: EntityType;
  occupationUntil: Date | string;
}

export class GimmickContext
  extends EntityContext
  implements GimmickContextOptions
{
  public static readonly FORMAT: string =
    EntityContext.FORMAT + '\tOCCUPIER_ID\tOCCUPIER_TYPE\tOCCUPATION_UNTIL';

  public readonly occupierId: EntityId;
  public readonly occupierType: EntityType;
  public readonly occupationUntil: Date;

  public constructor(options: GimmickContextOptions) {
    super(options);
    this.occupierId = options.occupierId;
    this.occupierType = options.occupierType;
    this.occupationUntil = new Date(options.occupationUntil);
  }

  public build(): string {
    return (
      super.build() +
      `\t${this.occupierId}\t${this.occupierType}\t${this.occupationUntil.toISOString()}`
    );
  }
}
