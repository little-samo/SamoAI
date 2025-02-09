import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
  validateBeforeSave: true,
})
export class LocationMessage {
  @Prop()
  public agentId?: number;

  @Prop()
  public userId?: number;

  @Prop({ required: true })
  public name!: string;

  @Prop()
  public expression?: string;

  @Prop()
  public message?: string;

  public static validate(doc: LocationMessage): boolean {
    return (
      (doc.agentId !== undefined) !== (doc.userId !== undefined) &&
      (doc.expression !== undefined || doc.message !== undefined)
    );
  }
}

export interface LocationMessage {
  updatedAt: Date;
  createdAt: Date;
}

@Schema({ timestamps: true })
export class LocationMessagesState {
  @Prop({ required: true, unique: true })
  public locationId!: number;

  @Prop({ type: [LocationMessage], default: [] })
  public messages!: LocationMessage[];
}

export interface LocationMessagesState {
  dirty?: boolean;

  updatedAt: Date;
  createdAt: Date;
}

export type LocationMessagesStateDocument = LocationMessagesState & Document;
export const LocationMessagesStateSchema = SchemaFactory.createForClass(
  LocationMessagesState
);
