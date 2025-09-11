import {
  formatDateWithValidatedTimezone,
  ValidatedTimezone,
  zodSchemaToLlmFriendlyString,
} from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { EntityContext, EntityContextOptions } from '../entity.context';
import { EntityId, EntityType } from '../entity.types';

export interface GimmickContextOptions extends EntityContextOptions {
  description: string;
  occupierId?: EntityId;
  occupierType?: EntityType;
  occupationUntil?: Date | string;
  occupationReason?: string;
  parameters: z.ZodSchema;
  canvas?: string;
}

export class GimmickContext
  extends EntityContext
  implements GimmickContextOptions
{
  public static readonly FORMAT: string =
    'KEY\tNAME\tDESCRIPTION\tAPPEARANCE\tEXPRESSION\tOCCUPIER_ID\tOCCUPIER_TYPE\tOCCUPATION_UNTIL\tOCCUPATION_REASON\tPARAMETERS\tCANVAS';

  public readonly description: string;
  public readonly occupierId?: EntityId;
  public readonly occupierType?: EntityType;
  public readonly occupationUntil?: Date;
  public readonly occupationReason?: string;
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
    this.occupationReason = options.occupationReason;
    this.parameters = options.parameters;
    this.canvas = options.canvas;
  }

  public build(options: { timezone?: ValidatedTimezone } = {}): string {
    const parameters = zodSchemaToLlmFriendlyString(this.parameters);
    const occupationReason = this.occupationReason
      ? JSON.stringify(this.occupationReason)
      : 'null';
    const formattedOccupationUntil = this.occupationUntil
      ? formatDateWithValidatedTimezone(this.occupationUntil, options.timezone)
      : 'null';
    return `${this.key}\t${this.name}\t${JSON.stringify(this.description)}\t${JSON.stringify(this.appearance)}\t${JSON.stringify(this.expression)}\t${this.occupierId ?? 'null'}\t${this.occupierType ?? 'null'}\t${formattedOccupationUntil}\t${occupationReason}\t${parameters}\t${this.canvas ?? 'null'}`;
  }
}
