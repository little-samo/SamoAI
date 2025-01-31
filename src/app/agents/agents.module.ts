import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AgentEntityState,
  AgentEntityStateSchema,
} from '@models/entities/agents/states/agent.entity-state';
import { AgentsController } from '@app/agents/agents.controller';
import { AgentsService } from '@app/agents/agents.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AgentEntityState.name, schema: AgentEntityStateSchema },
    ]),
  ],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
