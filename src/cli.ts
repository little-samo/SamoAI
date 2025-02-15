import { Command } from 'commander';
import { SamoAiApp } from '@app/app';
import { AgentsService } from '@app/agents/agents.service';
import { LocationsService } from '@app/locations/locations.service';
import { UsersService } from '@app/users/users.service';
import { WorldManager } from '@core/managers/world.manager';
import { LocationModel } from '@prisma/client';

async function bootstrap() {
  const samoai = new SamoAiApp();
  await samoai.bootstrap(false);

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

      const agentId = parseInt(agentIdStr);
      const agentsService = samoai.app!.get(AgentsService);
      await agentsService.getAgentModel(agentId);

      const usersService = samoai.app!.get(UsersService);
      const userId = 1;
      const userModel = await usersService.getUserModel(userId);

      const locationsService = samoai.app!.get(LocationsService);
      const locationName = `CLI_CHAT/agent:${agentId}/user:${userId}`;
      const locationModel =
        await locationsService.getOrCreateLocationModelByName({
          name: locationName,
        } as LocationModel);
      await WorldManager.instance.setLocationPauseUpdateUntil(
        locationModel.id,
        new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 100) // pause update forever
      );

      await WorldManager.instance.addLocationAgent(locationModel.id, agentId);
      await WorldManager.instance.addLocationUser(locationModel.id, userId);

      await WorldManager.instance.addLocationUserMessage(
        locationModel.id,
        userId,
        userModel.nickname,
        message
      );

      const location = await WorldManager.instance.updateLocation(
        userId,
        locationModel.id,
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
