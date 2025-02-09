import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { EntityState } from '@models/entities/entity.state';

@Schema({ timestamps: true })
export class AgentState extends EntityState {
  @Prop({ required: true, unique: true })
  public agentId!: number;

  @Prop({ type: [String], default: [] })
  public memories!: string[];
}

export interface AgentState {
  dirty?: boolean;

  updatedAt: Date;
  createdAt: Date;
}

export type AgentStateDocument = AgentState & Document;
export const AgentStateSchema = SchemaFactory.createForClass(AgentState);
