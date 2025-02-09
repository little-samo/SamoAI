import { Command } from 'commander';
import { SamoAiApp } from '@app/app';
import { AgentsService } from '@app/agents/agents.service';
import { LocationsService } from '@app/locations/locations.service';
import { UsersService } from '@app/users/users.service';
import { LocationMessage } from '@models/locations/states/location.messages-state';
import { WorldManager } from '@core/managers/world.manager';

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
      const agentId = parseInt(agentIdStr);
      const agentsService = samoai.app!.get(AgentsService);
      await agentsService.getAgentModel(agentId);

      const usersService = samoai.app!.get(UsersService);
      const userId = 1;
      const userModel = await usersService.getUserModel(userId);

      const locationsService = samoai.app!.get(LocationsService);
      const locationName = `CLI_CHAT/agent:${agentId}/user:${userId}`;
      const locationModel =
        await locationsService.getOrCreateLocationModelByName(locationName);

      await WorldManager.instance.addLocationAgent(locationModel.id, agentId);
      await WorldManager.instance.addLocationUser(locationModel.id, userId);

      const locationMessage = new LocationMessage();
      locationMessage.userId = userId;
      locationMessage.name = userModel.nickname;
      locationMessage.message = message;
      await WorldManager.instance.addLocationMessage(
        locationModel.id,
        locationMessage
      );

      const location = await WorldManager.instance.updateLocation(
        userModel,
        locationModel.id
      );

      for (const message of location.messagesState.messages) {
        console.log(`${message.name}: ${message.message}`);
      }
    });

  program.parse(process.argv);
}

bootstrap();
