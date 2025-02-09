import { Command } from 'commander';
import { SamoAiApp } from '@app/app';
import { AgentsService } from '@app/agents/agents.service';

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

  program.parse(process.argv);
}

bootstrap();
