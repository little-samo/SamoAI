import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AgentEntityStateTargetType = 'agent' | 'user';

@Schema({ timestamps: true })
export class AgentEntityState {
  @Prop({ required: true })
  public agentId!: number;

  @Prop({ required: true, enum: ['agent', 'user'] })
  public targetType!: AgentEntityStateTargetType;

  @Prop({ required: false })
  public targetAgentId?: number;

  @Prop({ required: false })
  public targetUserId?: number;

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
  { agentId: 1, targetAgentId: 1, targetUserId: 1 },
  { unique: true }
);
