import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { EntityState } from '@models/entities/entity.state';

@Schema({ timestamps: true })
export class UserState extends EntityState {
  @Prop({ required: true, unique: true })
  public userId!: number;
}

export interface UserState {
  dirty?: boolean;

  updatedAt: Date;
  createdAt: Date;
}

export type UserStateDocument = UserState & Document;
export const UserStateSchema = SchemaFactory.createForClass(UserState);
