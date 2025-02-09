import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
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

  @Prop({
    required: true,
    validate: [
      {
        validator: function (this: LocationMessage) {
          return (this.agentId !== undefined) !== (this.userId !== undefined);
        },
        message: 'Either agentId or userId must be provided, but not both',
      },
      {
        validator: function (this: LocationMessage) {
          return this.expression !== undefined || this.message !== undefined;
        },
        message: 'Either expression or message must be provided',
      },
    ],
  })
  public _validate?: never;
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
