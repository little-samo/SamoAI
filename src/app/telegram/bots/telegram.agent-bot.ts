import { AgentModel } from '@prisma/client';

import { TelegramUpdateDto } from '../dto/telegram.update-dto';

import { TelegramBot } from './telegram.bot';

export abstract class TelegramAgentBot extends TelegramBot {
  public agent?: AgentModel | null;

  public async refreshAgent(): Promise<void> {
    this.agent = await this.agentsService.getAgentByTelegramBotToken(
      this.token
    );
  }

  public override async handleUpdate(update: TelegramUpdateDto): Promise<void> {
    await this.refreshAgent();
    if (!this.agent || !this.agent.isActive || this.agent.isDeleted) {
      return;
    }
    await super.handleUpdate(update);
  }
}
