import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

import { EntityState } from '@/models/entities/entity.state.js';

@Schema({ timestamps: true })
export class UserState extends EntityState {
  @Prop({ required: true, unique: true })
  public userId!: number;

  @Prop({ type: [Number], default: [] })
  public locationIds!: number[];
}

export type UserStateDocument = UserState & Document;
export const UserStateSchema = SchemaFactory.createForClass(UserState);
