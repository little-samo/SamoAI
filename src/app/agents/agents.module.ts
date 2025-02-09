import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AgentEntityState,
  AgentEntityStateSchema,
} from '@models/entities/agents/states/agent.entity-state';
import { AgentsController } from '@app/agents/agents.controller';
import { AgentsService } from '@app/agents/agents.service';
import {
  AgentState,
  AgentStateSchema,
} from '@models/entities/agents/states/agent.state';

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
