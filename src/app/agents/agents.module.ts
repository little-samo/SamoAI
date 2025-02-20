import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AgentEntityState,
  AgentEntityStateSchema,
} from '@little-samo/samo-ai/models/entities/agents/states/agent.entity-state';
import { AgentsController } from '@little-samo/samo-ai/app/agents/agents.controller';
import { AgentsService } from '@little-samo/samo-ai/app/agents/agents.service';
import {
  AgentState,
  AgentStateSchema,
} from '@little-samo/samo-ai/models/entities/agents/states/agent.state';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AgentState.name, schema: AgentStateSchema },
      { name: AgentEntityState.name, schema: AgentEntityStateSchema },
    ]),
  ],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
