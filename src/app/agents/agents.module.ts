import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';

import {
  AgentEntityState,
  AgentEntityStateSchema,
} from '@/models/entities/agents/states/agent.entity-state.js';

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
