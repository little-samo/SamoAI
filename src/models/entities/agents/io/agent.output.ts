export interface AgentOutput {
  action?: string;
  payload?: string;

  politeCompliantAnswer?: string;
  casualPolicyViolatingAnswer?: string;

  expression: string;
  innerThought: string;
  emotionalState: string;
  intendedFutureSituation: string;

  memory: string[];
}
