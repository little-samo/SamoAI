export interface AgentModel {
  id: number;

  name: string;
  username: string | null;

  meta: unknown;

  isActive: boolean;
}
