import { Prop, Schema } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export abstract class EntityState {
  @Prop()
  public expression?: string;
}

export interface EntityState {
  updatedAt: Date;
  createdAt: Date;
}
