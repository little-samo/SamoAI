import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class LocationMessage {
  @Prop()
  public agentId?: number;

  @Prop()
  public userId?: number;

  @Prop({ required: true })
  public name!: string;

  @Prop({ required: true })
  public expression!: string;

  @Prop({ required: true })
  public message!: string;

  @Prop({ type: Date, default: Date.now })
  public createdAt!: Date;

  @Prop({
    required: true,
    validate: {
      validator: function (this: LocationMessage) {
        return (this.agentId !== undefined) !== (this.userId !== undefined);
      },
      message: 'Either agentId or userId must be provided, but not both',
    },
  })
  public _validate?: never;
}

@Schema({ timestamps: true })
export class LocationMessagesState {
  @Prop({ required: true, unique: true })
  public locationId!: number;

  @Prop({ type: [LocationMessage], default: [] })
  public messages!: LocationMessage[];

  @Prop({ type: Date, default: Date.now })
  public updatedAt!: Date;

  @Prop({ type: Date, default: Date.now })
  public createdAt!: Date;
}

export type LocationMessagesStateDocument = LocationMessagesState & Document;
export const LocationMessagesStateSchema = SchemaFactory.createForClass(
  LocationMessagesState
);
