import type {
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionResponse,
  PostTurnRequest,
  PostTurnResponse,
  SubmitSupervisorHintResponse,
  SubmitTaskAssignmentRequest,
  SubmitTaskAssignmentResponse,
} from '../../core/@types';
import { env } from '../../config/env';
import { SessionMemory } from '../../core/memory/sessionMemory';
import { Orchestrator, type AgentTurnEmission } from '../../core/orchestrator';
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
        channel: summary.channel,
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

    const response = await this.orchestrator.processTurn(
      sessionId,
      payload.teacherOrUserMessage,
      (emission: AgentTurnEmission) => {
        simulationRealtimeBus.publish({
          type: 'agent_turn_emitted',
          sessionId: emission.sessionId,
          mode: emission.mode,
          channel: emission.channel,
          topic: emission.topic,
          requestTurnId: emission.requestTurnId,
          emittedTurn: emission.emittedTurn,
        });
      },
    );

    const taskAssignmentRequiredEvent = response.events.find(
      (event) => event.type === 'task_assignment_required',
    );

    try {
      const afterSummary = this.orchestrator.getSessionSummary(sessionId);
      const afterStudentStates = extractStudentPersonalitySnapshots(afterSummary.agents);

      if (taskAssignmentRequiredEvent) {
        simulationRealtimeBus.publish({
          type: 'task_assignment_required',
          sessionId,
          mode: afterSummary.mode,
          channel: afterSummary.channel,
          topic: afterSummary.topic,
          lessonTurn: Number(taskAssignmentRequiredEvent.payload.lessonTurn ?? 0),
          phase: 'practice',
          classroomRuntime: afterSummary.classroomRuntime,
        });
      }

      simulationRealtimeBus.publish({
        type: 'turn_processed',
        sessionId,
        mode: afterSummary.mode,
        channel: afterSummary.channel,
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

  public submitSupervisorHint(sessionId: string, hintText: string): SubmitSupervisorHintResponse {
    return this.orchestrator.submitSupervisorHint(sessionId, hintText);
  }

  public submitTaskAssignment(
    sessionId: string,
    payload: SubmitTaskAssignmentRequest,
  ): SubmitTaskAssignmentResponse {
    return this.orchestrator.submitTaskAssignment(sessionId, payload);
  }
}

const memory = new SessionMemory();
const llmTool = createLlmTool(env.LLM_API_KEY, env.LLM_MODEL);
const orchestrator = new Orchestrator(memory, llmTool);

export const sessionsService = new SessionsService(orchestrator);
