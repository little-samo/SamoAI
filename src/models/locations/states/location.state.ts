import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, versionKey: false })
export class LocationState {
  @Prop({ required: true, unique: true })
  public locationId!: number;

  @Prop({ type: [Number], default: [], index: true })
  public agentIds!: number[];

  @Prop({ type: [Number], default: [], index: true })
  public userIds!: number[];

  @Prop({ index: true })
  public pauseUpdateUntil?: Date;
}

export interface LocationState {
  dirty?: boolean;

  updatedAt: Date;
  createdAt: Date;
}

export type LocationStateDocument = LocationState & Document;
export const LocationStateSchema = SchemaFactory.createForClass(LocationState);
