import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class LocationState {
  @Prop({ required: true, unique: true })
  public locationId!: number;

  @Prop({ type: [Number], default: [], index: true })
  public agentIds!: number[];

  @Prop({ type: [Number], default: [], index: true })
  public userIds!: number[];

  @Prop({ type: Date, default: Date.now })
  public updatedAt!: Date;

  @Prop({ type: Date, default: Date.now })
  public createdAt!: Date;
}

export type LocationStateDocument = LocationState & Document;
export const LocationStateSchema = SchemaFactory.createForClass(LocationState);
