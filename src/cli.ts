import { Command } from 'commander';
import { SamoAiApp } from '@little-samo/samo-ai/app/app';
import { AgentsService } from '@little-samo/samo-ai/app/agents/agents.service';
import { LocationsService } from '@little-samo/samo-ai/app/locations/locations.service';
import { UsersService } from '@little-samo/samo-ai/app/users/users.service';
import { WorldManager } from '@little-samo/samo-ai/core/managers/world.manager';
import { LocationModel } from '@prisma/client';
import {
  AgentId,
  UserId,
} from '@little-samo/samo-ai/models/entities/entity.types';
import { LocationId } from '@little-samo/samo-ai/models/locations/location';

async function bootstrap() {
  const samoai = new SamoAiApp();
  await samoai.bootstrap([], false);

  const program = new Command();

  program.hook('postAction', async () => {
    await samoai.app!.close();
    process.exit(0);
  });

  program
    .command('agent:list')
    .description('List all agents')
    .action(async () => {
      const agentsService = samoai.app!.get(AgentsService);
      const agents = await agentsService.getAllAgentModels();
      console.table(agents);
    });

  program
    .command('agent:chat <agentId> <message>')
    .description('Chat with an agent')
    .action(async (agentIdStr: string, message: string) => {
      const startTime = Date.now();

      const agentId = parseInt(agentIdStr) as AgentId;
      const agentsService = samoai.app!.get(AgentsService);
      await agentsService.getAgentModel(agentId);

      const usersService = samoai.app!.get(UsersService);
      const userId = 1 as UserId;
      const userModel = await usersService.getUserModel(userId);

      const locationsService = samoai.app!.get(LocationsService);
      const locationName = `CLI_CHAT/agent:${agentId}/user:${userId}`;
      const locationModel =
        await locationsService.getOrCreateLocationModelByName({
          name: locationName,
        } as LocationModel);
      const locationId = locationModel.id as LocationId;

      await WorldManager.instance.addLocationAgent(locationId, agentId);
      await WorldManager.instance.addLocationUser(locationId, userId);

      await WorldManager.instance.addLocationUserMessage(
        locationId,
        userId,
        userModel.nickname,
        message
      );

      const location = await WorldManager.instance.updateLocation(
        userId,
        locationId,
        {
          ignorePauseUpdateUntil: true,
        }
      );

      for (const message of location.messagesState.messages) {
        console.log(`${message.name}: ${message.message}`);
      }

      const endTime = Date.now();
      const executionTime = (endTime - startTime) / 1000;
      console.log(`\nExecution time: ${executionTime.toFixed(2)} seconds`);
    });

  program.parse(process.argv);
}

void bootstrap();
