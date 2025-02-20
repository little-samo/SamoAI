import {
  EntityId,
  EntityType,
} from '@little-samo/samo-ai/models/entities/entity.types';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

import { LocationId } from '../location';

@Schema({ timestamps: true, versionKey: false })
export class LocationEntityState {
  @Prop({ type: Number, required: true })
  public locationId!: LocationId;

  @Prop({ required: true, enum: ['agent', 'user'] })
  public targetType!: EntityType;

  @Prop({ type: Number, required: true })
  public targetId!: EntityId;

  @Prop({ type: Boolean, default: null })
  public isActive: boolean | null = null;

  @Prop({ type: String, default: null })
  public expression: string | null = null;
}

export interface LocationEntityState {
  updatedAt: Date;
  createdAt: Date;
}

export type LocationEntityStateDocument = LocationEntityState & Document;
export const LocationEntityStateSchema =
  SchemaFactory.createForClass(LocationEntityState);

LocationEntityStateSchema.index(
  { locationId: 1, targetType: 1, targetId: 1 },
  { unique: true }
);
