import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AgentEntityStateDocument } from '@models/entities/agents/states/agent.entity-state';
import { AgentEntityState } from '@models/entities/agents/states/agent.entity-state';

@Injectable()
export class AgentsService {
  protected readonly logger = new Logger(this.constructor.name);

  public constructor(
    @InjectModel(AgentEntityState.name)
    private agentStateModel: Model<AgentEntityStateDocument>
  ) {}
}
