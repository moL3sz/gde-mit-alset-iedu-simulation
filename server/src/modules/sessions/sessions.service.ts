import type {
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionResponse,
  PostTurnRequest,
  PostTurnResponse,
} from '../../core/@types';
import { env } from '../../config/env';
import { SessionMemory } from '../../core/memory/sessionMemory';
import { Orchestrator } from '../../core/orchestrator';
import {
  calculateStudentPersonalityChanges,
  extractStudentPersonalitySnapshots,
  simulationRealtimeBus,
} from '../../core/realtime/simulationRealtimeBus';
import { logger } from '../../core/shared/logger';
import { createLlmTool } from '../../core/tools/llm';

export class SessionsService {
  public constructor(private readonly orchestrator: Orchestrator) {}

  public createSession(payload: CreateSessionRequest): CreateSessionResponse {
    const created = this.orchestrator.createSession(payload);

    try {
      const summary = this.orchestrator.getSessionSummary(created.sessionId);

      simulationRealtimeBus.publish({
        type: 'session_created',
        sessionId: created.sessionId,
        mode: summary.mode,
        topic: summary.topic,
        metrics: summary.metrics,
        communicationGraph: summary.communicationGraph,
        studentStates: extractStudentPersonalitySnapshots(summary.agents),
      });
    } catch (error: unknown) {
      logger.warn('realtime_session_create_publish_failed', {
        sessionId: created.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return created;
  }

  public getSession(sessionId: string): GetSessionResponse {
    return this.orchestrator.getSessionSummary(sessionId);
  }

  public async postTurn(sessionId: string, payload: PostTurnRequest): Promise<PostTurnResponse> {
    const beforeSummary = this.orchestrator.getSessionSummary(sessionId);
    const beforeStudentStates = extractStudentPersonalitySnapshots(beforeSummary.agents);

    const response = await this.orchestrator.processTurn(sessionId, payload.teacherOrUserMessage);

    try {
      const afterSummary = this.orchestrator.getSessionSummary(sessionId);
      const afterStudentStates = extractStudentPersonalitySnapshots(afterSummary.agents);

      simulationRealtimeBus.publish({
        type: 'turn_processed',
        sessionId,
        mode: afterSummary.mode,
        topic: afterSummary.topic,
        turnId: response.turnId,
        transcript: response.transcript,
        events: response.events,
        metrics: response.metrics,
        communicationGraph: response.communicationGraph,
        currentTurnActivations: response.communicationGraph.currentTurnActivations,
        studentStates: afterStudentStates,
        studentStateChanges: calculateStudentPersonalityChanges(
          beforeStudentStates,
          afterStudentStates,
        ),
      });
    } catch (error: unknown) {
      logger.warn('realtime_turn_publish_failed', {
        sessionId,
        turnId: response.turnId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return response;
  }
}

const memory = new SessionMemory();
const llmTool = createLlmTool(env.LLM_API_KEY);
const orchestrator = new Orchestrator(memory, llmTool);

export const sessionsService = new SessionsService(orchestrator);
