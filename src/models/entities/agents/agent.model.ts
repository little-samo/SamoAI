export interface AgentModel {
  id: string | number | bigint;

  name: string;
  username: string | null;

  meta: unknown;
}
