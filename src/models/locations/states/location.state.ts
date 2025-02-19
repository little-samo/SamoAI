import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { AgentId, UserId } from '@models/entities/entity.types';

import { LocationId } from '../location';

@Schema({ timestamps: true, versionKey: false })
export class LocationState {
  @Prop({ type: Number, required: true, unique: true })
  public locationId!: LocationId;

  @Prop({ type: [Number], default: [], index: true })
  public agentIds!: AgentId[];

  @Prop({ type: [Number], default: [], index: true })
  public userIds!: UserId[];

  @Prop({ type: Date, index: true, default: null })
  public pauseUpdateUntil: Date | null = null;
}

export interface LocationState {
  dirty?: boolean;

  updatedAt: Date;
  createdAt: Date;
}

export type LocationStateDocument = LocationState & Document;
export const LocationStateSchema = SchemaFactory.createForClass(LocationState);
