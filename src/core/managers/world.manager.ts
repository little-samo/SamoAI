import { AgentsRepository } from '@core/repositories/agents.repository';
import { LocationsRepository } from '@core/repositories/locations.repository';
import { UsersRepository } from '@core/repositories/users.repository';
import { RedisLockService } from '@core/services/redis-lock.service';

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
}
