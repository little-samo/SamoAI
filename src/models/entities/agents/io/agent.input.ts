import { UserContext } from '@models/entities/users/user.context';
import { LocationContext } from '@models/locations/location.context';

import { AgentSelfContext } from '../agent.context';
import { AgentOtherContext } from '../agent.context';

export interface AgentInput {
  timestamp: Date;

  self: AgentSelfContext;

  location: LocationContext;

  users: UserContext[];
  otherAgents: AgentOtherContext[];
}
