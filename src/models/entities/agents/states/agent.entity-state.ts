import { AgentId, EntityId } from '@models/entities/entity.types';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AgentEntityStateTargetType = 'agent' | 'user';

@Schema({ timestamps: true, versionKey: false })
export class AgentEntityState {
  @Prop({ type: Number, required: true })
  public agentId!: AgentId;

  @Prop({ required: true, enum: ['agent', 'user'] })
  public targetType!: AgentEntityStateTargetType;

  @Prop({ type: Number, required: true })
  public targetId!: EntityId;

  @Prop({ type: [String], default: [] })
  public memories!: string[];
}

export interface AgentEntityState {
  updatedAt: Date;
  createdAt: Date;
}

export type AgentEntityStateDocument = AgentEntityState & Document;
export const AgentEntityStateSchema =
  SchemaFactory.createForClass(AgentEntityState);

AgentEntityStateSchema.index(
  { agentId: 1, targetType: 1, targetId: 1 },
  { unique: true }
);
