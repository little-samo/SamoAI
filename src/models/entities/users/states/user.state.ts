import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { EntityState } from '@models/entities/entity.state';
import { UserId } from '@models/entities/entity.types';

@Schema({ timestamps: true, versionKey: false })
export class UserState extends EntityState {
  @Prop({ type: Number, required: true, unique: true })
  public userId!: UserId;
}

export interface UserState {
  dirty?: boolean;

  updatedAt: Date;
  createdAt: Date;
}

export type UserStateDocument = UserState & Document;
export const UserStateSchema = SchemaFactory.createForClass(UserState);
