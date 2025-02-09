import { Prop, Schema } from '@nestjs/mongoose';

@Schema({ timestamps: true, versionKey: false })
export abstract class EntityState {
  @Prop()
  public expression?: string;
}

export interface EntityState {
  dirty?: boolean;

  updatedAt: Date;
  createdAt: Date;
}
