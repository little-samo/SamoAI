import { AgentId, UserId } from '@models/entities/entity.types';
import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  validateBeforeSave: true,
  versionKey: false,
})
export class LocationMessage {
  @Prop({ type: Number })
  public agentId?: AgentId;

  @Prop({ type: Number })
  public userId?: UserId;

  @Prop()
  public targetEntityKey?: string;

  @Prop({ required: true })
  public name!: string;

  @Prop()
  public expression?: string;

  @Prop()
  public message?: string;

  @Prop({ required: true })
  public updatedAt!: Date;

  @Prop({ required: true })
  public createdAt!: Date;

  public static validate(doc: LocationMessage): boolean {
    return (
      (doc.agentId !== undefined) !== (doc.userId !== undefined) &&
      (doc.expression !== undefined || doc.message !== undefined)
    );
  }
}

@Schema({
  timestamps: true,
  versionKey: false,
})
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
