import type { AgentKind, AgentState, Session, SessionMetrics, Turn } from '../@types';
import type { LlmTool } from '../tools/llm';

export interface AgentRunInput {
  teacherOrUserMessage: string;
  session: Session;
  recentTurns: Turn[];
}

export interface AgentRunContext {
  llm: LlmTool;
  topic: string;
  emitToken: (token: string) => void;
}

export interface AgentRunResult {
  message: string;
  metadata?: Record<string, unknown>;
  statePatch?: Partial<AgentState>;
  metricsPatch?: Partial<SessionMetrics>;
}

export interface Agent {
  id: string;
  kind: AgentKind;
  name: string;
  run(input: AgentRunInput, context: AgentRunContext): Promise<AgentRunResult>;
}
