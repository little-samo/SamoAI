import { Prop, Schema } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export abstract class EntityState {
  @Prop({ default: '' })
  public expression!: string;

  @Prop({ type: Date, default: Date.now })
  public updatedAt!: Date;

  @Prop({ type: Date, default: Date.now })
  public createdAt!: Date;
}
