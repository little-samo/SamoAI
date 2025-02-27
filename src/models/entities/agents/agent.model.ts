export interface AgentModel {
  id: number;
  createdAt: Date;
  updatedAt: Date;

  name: string;
  username: string | null;

  meta: unknown;

  isActive: boolean;
}
