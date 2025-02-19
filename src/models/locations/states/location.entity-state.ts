import { EntityType } from '@models/entities/entity.types';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, versionKey: false })
export class LocationEntityState {
  @Prop({ required: true })
  public locationId!: number;

  @Prop({ required: true, enum: ['agent', 'user'] })
  public targetType!: EntityType;

  @Prop({ required: true })
  public targetId!: number;

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
