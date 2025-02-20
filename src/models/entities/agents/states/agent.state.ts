import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { EntityState } from '@little-samo/samo-ai/models/entities/entity.state';
import { AgentId } from '@little-samo/samo-ai/models/entities/entity.types';

@Schema({ timestamps: true, versionKey: false })
export class AgentState extends EntityState {
  @Prop({ type: Number, required: true, unique: true })
  public agentId!: AgentId;

  @Prop({ type: [String], default: [] })
  public memories!: string[];
}

export interface AgentState {
  updatedAt: Date;
  createdAt: Date;
}

export type AgentStateDocument = AgentState & Document;
export const AgentStateSchema = SchemaFactory.createForClass(AgentState);
