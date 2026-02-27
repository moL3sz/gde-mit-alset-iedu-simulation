import type {
  AgentProfile,
  SimulationRealtimeEvent,
  StudentPersonalityChange,
  StudentPersonalitySnapshot,
} from '../@types';
import { logger } from '../shared/logger';

type RealtimeListener = (event: SimulationRealtimeEvent) => void;

const round = (value: number): number => Number(value.toFixed(4));

const cloneState = (
  state: StudentPersonalitySnapshot['state'],
): StudentPersonalitySnapshot['state'] => ({
  attention: state.attention,
  boredom: state.boredom,
  fatigue: state.fatigue,
  knowledgeRetention: state.knowledgeRetention,
  eslSupportNeeded: state.eslSupportNeeded,
  emotion: state.emotion,
  misconceptions: [...state.misconceptions],
});

const isStudentAgent = (agent: AgentProfile): boolean => agent.kind.startsWith('student_');

export const extractStudentPersonalitySnapshots = (
  agents: AgentProfile[],
): StudentPersonalitySnapshot[] => {
  return agents.filter(isStudentAgent).map((agent) => ({
    id: agent.id,
    name: agent.name,
    kind: agent.kind,
    state: cloneState(agent.state),
  }));
};

export const calculateStudentPersonalityChanges = (
  previous: StudentPersonalitySnapshot[],
  current: StudentPersonalitySnapshot[],
): StudentPersonalityChange[] => {
  const previousById = new Map(previous.map((student) => [student.id, student]));

  return current
    .map((student) => {
      const oldValue = previousById.get(student.id);

      if (!oldValue) {
        return null;
      }

      return {
        id: student.id,
        name: student.name,
        kind: student.kind,
        previousState: cloneState(oldValue.state),
        currentState: cloneState(student.state),
        deltas: {
          attention: round(student.state.attention - oldValue.state.attention),
          boredom: round(student.state.boredom - oldValue.state.boredom),
          fatigue: round(student.state.fatigue - oldValue.state.fatigue),
          knowledgeRetention: round(
            student.state.knowledgeRetention - oldValue.state.knowledgeRetention,
          ),
        },
      };
    })
    .filter((value): value is StudentPersonalityChange => value !== null);
};

class SimulationRealtimeBus {
  private readonly listeners = new Set<RealtimeListener>();

  public subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public publish(event: SimulationRealtimeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error: unknown) {
        logger.warn('realtime_listener_failed', {
          error: error instanceof Error ? error.message : String(error),
          eventType: event.type,
          sessionId: event.sessionId,
        });
      }
    }
  }
}

export const simulationRealtimeBus = new SimulationRealtimeBus();
