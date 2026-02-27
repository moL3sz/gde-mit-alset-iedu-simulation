export interface AgentSummary {
  id: string;
  kind: string;
  name: string;
}

export interface AgentExecutionMetadata {
  latencyMs?: number;
  model?: string;
  provider?: string;
}
