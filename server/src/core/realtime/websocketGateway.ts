import type { Server as HttpServer } from 'node:http';

import { Server as SocketIoServer, type Namespace, type Socket } from 'socket.io';

import type {
  RealtimeClientCommand,
  SimulationChannel,
  SimulationRealtimeEvent,
  SubmitSupervisorHintResponse,
  WsAgentTurnPayload,
  WsConnectedPayload,
  WsEnvelope,
  WsErrorPayload,
  WsGraphPayload,
  WsStudentStatesPayload,
  WsSubscriptionPayload,
  WsTaskAssignmentRequiredPayload,
  WsSupervisorHintPayload,
  WsTurnPayload,
} from '../@types';
import { logger } from '../shared/logger';
import { simulationRealtimeBus } from './simulationRealtimeBus';

const SOCKET_IO_PATH = '/socket.io';
const SUPERVISED_NAMESPACE = '/supervised';
const UNSUPERVISED_NAMESPACE = '/unsupervised';

const nowIso = (): string => new Date().toISOString();

const toEnvelope = <TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
  sessionId?: string,
): WsEnvelope<TType, TPayload> => ({
  type,
  timestamp: nowIso(),
  sessionId,
  payload,
});

const toRoomName = (sessionId: string): string => `session:${sessionId}`;

const parseClientCommand = (raw: unknown): RealtimeClientCommand | null => {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (record.type !== 'subscribe' && record.type !== 'unsubscribe' && record.type !== 'ping') {
    return null;
  }

  if (record.sessionId !== undefined && typeof record.sessionId !== 'string') {
    return null;
  }

  return {
    type: record.type,
    sessionId: record.sessionId,
  };
};

const parseSessionId = (raw: unknown): string | null => {
  if (typeof raw === 'string') {
    return raw;
  }

  if (typeof raw === 'object' && raw !== null) {
    const record = raw as Record<string, unknown>;

    if (typeof record.sessionId === 'string') {
      return record.sessionId;
    }
  }

  return null;
};

const parseSupervisorHintPayload = (
  raw: unknown,
): { sessionId: string; hintText: string } | null => {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (typeof record.sessionId !== 'string' || typeof record.hintText !== 'string') {
    return null;
  }

  const hintText = record.hintText.trim();
  if (!hintText) {
    return null;
  }

  return {
    sessionId: record.sessionId,
    hintText,
  };
};

export interface AttachWebSocketGatewayOptions {
  submitSupervisorHint: (
    sessionId: string,
    hintText: string,
  ) => SubmitSupervisorHintResponse | Promise<SubmitSupervisorHintResponse>;
}

class SimulationSocketGateway {
  private readonly io: SocketIoServer;
  private readonly supervisedNamespace: Namespace;
  private readonly unsupervisedNamespace: Namespace;
  private readonly unsubscribeRealtime: () => void;

  public constructor(
    server: HttpServer,
    private readonly options: AttachWebSocketGatewayOptions,
  ) {
    this.io = new SocketIoServer(server, {
      path: SOCKET_IO_PATH,
      cors: {
        origin: true,
        credentials: true,
      },
    });

    this.supervisedNamespace = this.io.of(SUPERVISED_NAMESPACE);
    this.unsupervisedNamespace = this.io.of(UNSUPERVISED_NAMESPACE);

    this.supervisedNamespace.on('connection', (socket) => {
      this.handleConnection(socket, 'supervised');
    });
    this.unsupervisedNamespace.on('connection', (socket) => {
      this.handleConnection(socket, 'unsupervised');
    });

    this.unsubscribeRealtime = simulationRealtimeBus.subscribe((event) => {
      this.broadcastRealtimeEvent(event);
    });
  }

  public close(): void {
    this.unsubscribeRealtime();
    void this.io.close();
  }

  private handleConnection(socket: Socket, channel: SimulationChannel): void {
    const connectedPayload: WsConnectedPayload = {
      connectionId: socket.id,
      endpoint: '/socket.io',
      channel,
    };

    socket.emit('connection.ready', toEnvelope('connection.ready', connectedPayload));

    const querySessionId = socket.handshake.query.sessionId;
    if (typeof querySessionId === 'string' && querySessionId.length > 0) {
      this.subscribeSocketToSession(socket, querySessionId);
    }

    socket.on('subscribe', (payload: unknown) => {
      const sessionId = parseSessionId(payload);

      if (!sessionId) {
        const errorPayload: WsErrorPayload = {
          message: 'sessionId is required for subscribe event.',
        };
        socket.emit('system.error', toEnvelope('system.error', errorPayload));
        return;
      }

      this.subscribeSocketToSession(socket, sessionId);
    });

    socket.on('unsubscribe', (payload: unknown) => {
      const sessionId = parseSessionId(payload);

      if (!sessionId) {
        const errorPayload: WsErrorPayload = {
          message: 'sessionId is required for unsubscribe event.',
        };
        socket.emit('system.error', toEnvelope('system.error', errorPayload));
        return;
      }

      this.unsubscribeSocketFromSession(socket, sessionId);
    });

    socket.on('ping', () => {
      socket.emit('system.pong', toEnvelope('system.pong', { ok: true }));
    });

    socket.on('command', (payload: unknown) => {
      const command = parseClientCommand(payload);

      if (!command) {
        const errorPayload: WsErrorPayload = {
          message:
            'Invalid command payload. Expected { type: subscribe|unsubscribe|ping, sessionId?: string }.',
        };
        socket.emit('system.error', toEnvelope('system.error', errorPayload));
        return;
      }

      if (command.type === 'ping') {
        socket.emit('system.pong', toEnvelope('system.pong', { ok: true }));
        return;
      }

      if (!command.sessionId) {
        const errorPayload: WsErrorPayload = {
          message: 'sessionId is required for subscribe/unsubscribe command.',
        };
        socket.emit('system.error', toEnvelope('system.error', errorPayload));
        return;
      }

      if (command.type === 'subscribe') {
        this.subscribeSocketToSession(socket, command.sessionId);
        return;
      }

      this.unsubscribeSocketFromSession(socket, command.sessionId);
    });

    socket.on('supervisor.whisper', async (rawPayload: unknown) => {
      if (channel !== 'supervised') {
        const errorPayload: WsErrorPayload = {
          message: 'supervisor.whisper is only supported in supervised simulation channel.',
        };
        socket.emit('system.error', toEnvelope('system.error', errorPayload));
        return;
      }

      const payload = parseSupervisorHintPayload(rawPayload);
      if (!payload) {
        const errorPayload: WsErrorPayload = {
          message: 'Invalid supervisor.whisper payload. Expected { sessionId: string, hintText: string }.',
        };
        socket.emit('system.error', toEnvelope('system.error', errorPayload));
        return;
      }

      try {
        const response = await this.options.submitSupervisorHint(payload.sessionId, payload.hintText);

        const whisperPayload: WsSupervisorHintPayload = {
          sessionId: response.sessionId,
          hintText: response.hintText,
          createdAt: response.createdAt,
        };

        this.broadcastToSession(
          'supervised',
          response.sessionId,
          'simulation.supervisor_hint',
          toEnvelope('simulation.supervisor_hint', whisperPayload, response.sessionId),
        );
      } catch (error: unknown) {
        logger.warn('supervisor_whisper_failed', {
          error: error instanceof Error ? error.message : String(error),
          sessionId: payload.sessionId,
        });

        const errorPayload: WsErrorPayload = {
          message: error instanceof Error ? error.message : 'Failed to submit supervisor hint.',
        };
        socket.emit('system.error', toEnvelope('system.error', errorPayload, payload.sessionId));
      }
    });
  }

  private subscribeSocketToSession(socket: Socket, sessionId: string): void {
    void socket.join(toRoomName(sessionId));

    const payload: WsSubscriptionPayload = { sessionId };
    socket.emit('subscription.confirmed', toEnvelope('subscription.confirmed', payload, sessionId));
  }

  private unsubscribeSocketFromSession(socket: Socket, sessionId: string): void {
    void socket.leave(toRoomName(sessionId));

    const payload: WsSubscriptionPayload = { sessionId };
    socket.emit('subscription.removed', toEnvelope('subscription.removed', payload, sessionId));
  }

  private broadcastRealtimeEvent(event: SimulationRealtimeEvent): void {
    if (event.type === 'session_created') {
      this.broadcastToSession(
        event.channel,
        event.sessionId,
        'simulation.session_created',
        toEnvelope(
          'simulation.session_created',
          {
            mode: event.mode,
            channel: event.channel,
            topic: event.topic,
            metrics: event.metrics,
            communicationGraph: event.communicationGraph,
            studentStates: event.studentStates,
          },
          event.sessionId,
        ),
      );
      return;
    }

    if (event.type === 'agent_turn_emitted') {
      const payload: WsAgentTurnPayload = {
        requestTurnId: event.requestTurnId,
        emittedTurn: event.emittedTurn,
      };

      this.broadcastToSession(
        event.channel,
        event.sessionId,
        'simulation.agent_turn_emitted',
        toEnvelope('simulation.agent_turn_emitted', payload, event.sessionId),
      );
      return;
    }

    if (event.type === 'task_assignment_required') {
      const payload: WsTaskAssignmentRequiredPayload = {
        lessonTurn: event.lessonTurn,
        phase: 'practice',
        classroomRuntime: event.classroomRuntime,
      };

      this.broadcastToSession(
        event.channel,
        event.sessionId,
        'simulation.task_assignment_required',
        toEnvelope('simulation.task_assignment_required', payload, event.sessionId),
      );
      return;
    }

    const turnPayload: WsTurnPayload = {
      turnId: event.turnId,
      transcript: event.transcript,
      events: event.events,
      metrics: event.metrics,
    };

    const graphPayload: WsGraphPayload = {
      turnId: event.turnId,
      communicationGraph: event.communicationGraph,
      currentTurnActivations: event.currentTurnActivations,
    };

    const studentStatesPayload: WsStudentStatesPayload = {
      turnId: event.turnId,
      studentStates: event.studentStates,
      studentStateChanges: event.studentStateChanges,
    };

    this.broadcastToSession(
      event.channel,
      event.sessionId,
      'simulation.turn_processed',
      toEnvelope('simulation.turn_processed', turnPayload, event.sessionId),
    );

    this.broadcastToSession(
      event.channel,
      event.sessionId,
      'simulation.graph_updated',
      toEnvelope('simulation.graph_updated', graphPayload, event.sessionId),
    );

    this.broadcastToSession(
      event.channel,
      event.sessionId,
      'simulation.student_states_updated',
      toEnvelope('simulation.student_states_updated', studentStatesPayload, event.sessionId),
    );
  }

  private broadcastToSession(
    channel: SimulationChannel,
    sessionId: string,
    eventName: string,
    payload: WsEnvelope<string, unknown>,
  ): void {
    const namespace = channel === 'supervised' ? this.supervisedNamespace : this.unsupervisedNamespace;
    namespace.to(toRoomName(sessionId)).emit(eventName, payload);
  }
}

export interface WebSocketGateway {
  close(): void;
}

export const attachSimulationWebSocketGateway = (
  server: HttpServer,
  options: AttachWebSocketGatewayOptions,
): WebSocketGateway => {
  const gateway = new SimulationSocketGateway(server, options);

  return {
    close: () => gateway.close(),
  };
};
