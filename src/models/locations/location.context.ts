import {
  formatDateWithValidatedTimezone,
  ValidatedTimezone,
} from '@little-samo/samo-ai/common';

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
  imageKey?: string;
  isSensitiveImage?: boolean;
  isHiddenFromAgent?: boolean;
  processed?: boolean;
  created: string | Date;
}

export class LocationMessageContext extends Context {
  public static readonly FORMAT =
    'CREATED\tPROCESSED\tENTITY_KEY\tTARGET_KEY\tNAME\tMESSAGE\tEXPRESSION\tACTION';

  public readonly key: EntityKey;
  public readonly targetKey?: EntityKey;
  public readonly name: string;
  public readonly message?: string;
  public readonly expression?: string;
  public readonly action?: string;
  public readonly image?: string;
  public readonly imageKey?: string;
  public readonly isSensitiveImage?: boolean;
  public readonly isHiddenFromAgent?: boolean;
  public readonly processed?: boolean;
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
    this.imageKey = options.imageKey;
    this.isSensitiveImage = options.isSensitiveImage;
    this.isHiddenFromAgent = options.isHiddenFromAgent;
    this.processed = options.processed;
    this.created = new Date(options.created);
  }

  public build(options: { timezone?: ValidatedTimezone } = {}): string {
    const targetKey = this.targetKey ?? 'null';
    const message = this.message ? JSON.stringify(this.message) : 'null';
    const expression = this.expression
      ? JSON.stringify(this.expression)
      : 'null';
    let action = this.action ? JSON.stringify(this.action) : 'null';
    if (this.image) {
      const hiddenFlag = this.isSensitiveImage ? ' --hidden' : '';
      action = this.imageKey
        ? `"upload_image --image-key ${this.imageKey}${hiddenFlag}"`
        : `"upload_image${hiddenFlag}"`;
    }
    const processed =
      this.processed === undefined ? 'null' : this.processed ? 'true' : 'false';
    const formattedCreated = formatDateWithValidatedTimezone(
      this.created,
      options.timezone
    );
    return `${formattedCreated}\t${processed}\t${this.key}\t${targetKey}\t${JSON.stringify(
      this.name
    )}\t${message}\t${expression}\t${action}`;
  }
}

export interface LocationCanvasContextOptions {
  name: string;
  description: string;
  maxLength: number;
  lastModeifierKey: EntityKey;
  lastModifiedAt: string | Date;
  text: string;
  timezone?: ValidatedTimezone;
}

export class LocationCanvasContext extends Context {
  public static readonly FORMAT =
    'NAME\tDESCRIPTION\tLENGTH\tLAST_MODIFIED_BY\tLAST_MODIFIED\tTEXT';

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

  public build(options: { timezone?: ValidatedTimezone } = {}): string {
    const formattedLastModifiedAt = formatDateWithValidatedTimezone(
      this.lastModifiedAt,
      options.timezone
    );
    return `${this.name}\t${JSON.stringify(this.description)}\t${this.text.length}/${this.maxLength}\t${this.lastModeifierKey}\t${formattedLastModifiedAt}\t${this.text}`;
  }
}

export interface LocationObjectiveContextOptions {
  index: number;
  description: string;
  completed: boolean;
  completedAt?: string | Date;
  timezone?: ValidatedTimezone;
}

export class LocationObjectiveContext extends Context {
  public static readonly FORMAT = 'INDEX\tSTATUS\tDESCRIPTION\COMPLETED';

  public readonly index: number;
  public readonly description: string;
  public readonly completed: boolean;
  public readonly completedAt?: Date;
  public readonly timezone?: ValidatedTimezone;

  public constructor(options: LocationObjectiveContextOptions) {
    super();
    this.index = options.index;
    this.description = options.description;
    this.completed = options.completed;
    this.completedAt = options.completedAt
      ? new Date(options.completedAt)
      : undefined;
    this.timezone = options.timezone;
  }

  public build(): string {
    const status = this.completed ? 'done' : 'pending';
    const formattedCompletedAt = this.completedAt
      ? formatDateWithValidatedTimezone(this.completedAt, this.timezone)
      : 'null';
    return `${this.index}\t${status}\t${this.description}\t${formattedCompletedAt}`;
  }
}

export interface LocationMissionContextOptions {
  mainMission: string;
  objectives: LocationObjectiveContextOptions[];
  createdAt: string | Date;
  updatedAt: string | Date;
  timezone?: ValidatedTimezone;
}

export class LocationMissionContext extends Context {
  public static readonly FORMAT = 'MAIN_MISSION\tCREATED\tUPDATED\tPROGRESS';

  public readonly mainMission: string;
  public readonly objectives: LocationObjectiveContext[];
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly timezone?: ValidatedTimezone;

  public constructor(options: LocationMissionContextOptions) {
    super();
    this.mainMission = options.mainMission;
    this.objectives = options.objectives.map(
      (o) => new LocationObjectiveContext(o)
    );
    this.createdAt = new Date(options.createdAt);
    this.updatedAt = new Date(options.updatedAt);
    this.timezone = options.timezone;
  }

  public build(): string {
    const formattedCreatedAt = formatDateWithValidatedTimezone(
      this.createdAt,
      this.timezone
    );
    const formattedUpdatedAt = formatDateWithValidatedTimezone(
      this.updatedAt,
      this.timezone
    );
    const completedCount = this.objectives.filter((o) => o.completed).length;
    const totalCount = this.objectives.length;
    const progress = `${completedCount}/${totalCount}`;

    let result = `${JSON.stringify(this.mainMission)}\t${formattedCreatedAt}\t${formattedUpdatedAt}\t${progress}`;

    if (this.objectives.length > 0) {
      result += '\n\nObjectives:\n' + LocationObjectiveContext.FORMAT + '\n';
      result += this.objectives.map((o) => o.build()).join('\n');
    }

    return result;
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
