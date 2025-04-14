import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

import { EntityContext, EntityContextOptions } from '../entity.context';
import { EntityId, EntityType } from '../entity.types';

export interface GimmickContextOptions extends EntityContextOptions {
  description: string;
  occupierId?: EntityId;
  occupierType?: EntityType;
  occupationUntil?: Date | string;
  parameters: z.ZodSchema;
  canvas?: string;
}

export class GimmickContext
  extends EntityContext
  implements GimmickContextOptions
{
  public static readonly FORMAT: string =
    'KEY\tNAME\tDESCRIPTION\tAPPEARANCE\tEXPRESSION\tOCCUPIER_ID\tOCCUPIER_TYPE\tOCCUPATION_UNTIL\tPARAMETERS\tCANVAS';

  public readonly description: string;
  public readonly occupierId?: EntityId;
  public readonly occupierType?: EntityType;
  public readonly occupationUntil?: Date;
  public readonly parameters: z.ZodSchema;
  public readonly canvas?: string;

  public constructor(options: GimmickContextOptions) {
    super(options);
    this.description = options.description;
    this.occupierId = options.occupierId;
    this.occupierType = options.occupierType;
    this.occupationUntil = options.occupationUntil
      ? new Date(options.occupationUntil)
      : undefined;
    this.parameters = options.parameters;
    this.canvas = options.canvas;
  }

  public build(): string {
    const parameters = zodToJsonSchema(this.parameters, {
      target: 'openAi',
    });
    delete parameters['$schema'];

    return `${this.key}\t${this.name}\t${this.description}\t${this.appearance}\t${this.expression}\t${this.occupierId ?? 'null'}\t${this.occupierType ?? 'null'}\t${this.occupationUntil?.toISOString() ?? 'null'}\t${JSON.stringify(parameters)}\t${this.canvas ?? 'null'}`;
  }
}
