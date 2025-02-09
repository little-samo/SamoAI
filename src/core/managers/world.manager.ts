import { AgentsRepository } from '@core/repositories/agents.repository';
import { LocationsRepository } from '@core/repositories/locations.repository';
import { UsersRepository } from '@core/repositories/users.repository';
import { RedisLockService } from '@core/services/redis-lock.service';
import { Agent } from '@models/entities/agents/agent';
import { User } from '@models/entities/users/user';
import { Location } from '@models/locations/location';

export class WorldManager {
  private static readonly LOCK_TTL = 30; // 30 seconds
  private static readonly LOCATION_LOCK_PREFIX = 'lock:location:';
  private static readonly AGENT_LOCK_PREFIX = 'lock:agent:';
  private static readonly USER_LOCK_PREFIX = 'lock:user:';

  private static _instance: WorldManager;

  public static initialize(
    redisLockService: RedisLockService,
    locationRepository: LocationsRepository,
    agentRepository: AgentsRepository,
    userRepository: UsersRepository
  ) {
    WorldManager._instance = new WorldManager(
      redisLockService,
      locationRepository,
      agentRepository,
      userRepository
    );
  }

  public static get instance() {
    if (!this._instance) {
      throw new Error('WorldManager not initialized');
    }
    return this._instance;
  }

  private constructor(
    private readonly redisLockService: RedisLockService,
    private readonly locationRepository: LocationsRepository,
    private readonly agentRepository: AgentsRepository,
    private readonly userRepository: UsersRepository
  ) {}

  private async loadLocation(locationId: number): Promise<Location> {
    const locationModel =
      await this.locationRepository.getLocationModel(locationId);
    const locationState =
      await this.locationRepository.getLocationState(locationId);
    const locationMessagesState =
      await this.locationRepository.getLocationMessagesState(locationId);

    const location = new Location(
      locationModel,
      locationState,
      locationMessagesState
    );

    const agents = await this.loadAgents(
      location,
      location.state.agentIds,
      location.state.userIds
    );
    const users = await this.loadUsers(location, location.state.userIds);

    for (const agent of Object.values(agents)) {
      location.addEntity(agent);
    }
    for (const user of Object.values(users)) {
      location.addEntity(user);
    }

    return location;
  }

  private async loadAgents(
    location: Location,
    agentIds: number[],
    userIds: number[]
  ): Promise<Record<number, Agent>> {
    const agentModels = await this.agentRepository.getAgentModels(agentIds);
    const agentStates = await this.agentRepository.getAgentStates(agentIds);
    const agentEntityStates = await this.agentRepository.getAgentEntityStates(
      agentIds,
      agentIds,
      userIds
    );

    const agents: Record<number, Agent> = {};
    for (const agentId of agentIds) {
      const agent = new Agent(
        location,
        agentModels[agentId],
        agentStates[agentId]
      );

      const entityStates = agentEntityStates[agentId];
      if (entityStates) {
        for (const entityState of entityStates) {
          agent.addEntityState(entityState);
        }
      }

      agents[agentId] = agent;
    }

    return agents;
  }

  private async loadUsers(
    location: Location,
    userIds: number[]
  ): Promise<Record<number, User>> {
    const userModels = await this.userRepository.getUserModels(userIds);
    const userStates = await this.userRepository.getUserStates(userIds);

    const users: Record<number, User> = {};
    for (const userId of userIds) {
      users[userId] = new User(
        location,
        userModels[userId],
        userStates[userId]
      );
    }

    return users;
  }

  private async saveLocation(location: Location): Promise<void> {
    await this.locationRepository.saveLocationModel(location.model);
    await this.locationRepository.saveLocationState(location.state);
    await this.locationRepository.saveLocationMessagesState(
      location.messagesState
    );

    await this.saveAgents(Object.values(location.agents));
    await this.saveUsers(Object.values(location.users));
  }

  private async saveAgents(agents: Agent[]): Promise<void> {
    await this.agentRepository.saveAgentStates(
      agents.map((agent) => agent.state)
    );
    await this.agentRepository.saveAgentEntityStates(
      agents.flatMap((agent) => agent.getEntityStates())
    );
  }

  private async saveUsers(users: User[]): Promise<void> {
    await this.userRepository.saveUserStates(users.map((user) => user.state));
  }

  public async updateLocation(locationId: number): Promise<Location> {
    const lockKey = `${WorldManager.LOCATION_LOCK_PREFIX}${locationId}`;
    const lock = await this.redisLockService.acquireLock(
      lockKey,
      WorldManager.LOCK_TTL
    );
    if (!lock) {
      throw new Error(`Failed to lock location ${locationId}`);
    }
    try {
      const location = await this.loadLocation(locationId);
      await location.update();

      await this.saveLocation(location);

      return location;
    } finally {
      await lock.release();
    }
  }
}
