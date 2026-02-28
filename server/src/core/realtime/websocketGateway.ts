import type { Server as HttpServer } from 'node:http';

import { Server as SocketIoServer, type Namespace, type Socket } from 'socket.io';

import type {
  RealtimeClientCommand,
  WsConnectedPayload,
  WsEnvelope,
  WsErrorPayload,
  WsGraphPayload,
  WsStudentStatesPayload,
  WsSubscriptionPayload,
  WsTurnPayload,
} from '../@types';
import { logger } from '../shared/logger';
import { registerSocketCommandHandlers } from './socketCommandHandlers';
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

type SimulationChannel = 'supervised' | 'unsupervised';

export interface AttachWebSocketGatewayOptions {
  submitSupervisorHint: (
    sessionId: string,
    hintText: string,
  ) => {
    sessionId: string;
    hintText: string;
    createdAt: string;
  } | Promise<{
    sessionId: string;
    hintText: string;
    createdAt: string;
  }>;
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
      this.broadcastRealtimeEvent(event as unknown as Record<string, unknown>);
    });
  }

  public close(): void {
    this.unsubscribeRealtime();
    void this.io.close();
  }

  private handleConnection(socket: Socket, channel: SimulationChannel): void {
    registerSocketCommandHandlers(socket);

    logger.info('socket_client_connected', {
      channel,
      socketId: socket.id,
      transport: socket.conn.transport.name,
    });

    const connectedPayload: WsConnectedPayload & { channel: SimulationChannel } = {
      connectionId: socket.id,
      endpoint: '/socket.io',
      channel,
    };

    socket.emit('connection.ready', toEnvelope('connection.ready', connectedPayload));

    const querySessionId = socket.handshake.query.sessionId;
    if (typeof querySessionId === 'string' && querySessionId.length > 0) {
      this.subscribeSocketToSession(socket, querySessionId);
    }

    socket.on('disconnect', (reason) => {
      logger.info('socket_client_disconnected', {
        channel,
        socketId: socket.id,
        reason,
      });
    });

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
          message: 'supervisor.whisper is only supported in supervised channel.',
        };
        socket.emit('system.error', toEnvelope('system.error', errorPayload));
        return;
      }

      const payload = parseSupervisorHintPayload(rawPayload);
      if (!payload) {
        const errorPayload: WsErrorPayload = {
          message: 'Invalid supervisor.whisper payload.',
        };
        socket.emit('system.error', toEnvelope('system.error', errorPayload));
        return;
      }

      try {
        const response = await this.options.submitSupervisorHint(payload.sessionId, payload.hintText);
        this.broadcastToSession(
          'supervised',
          response.sessionId,
          'simulation.supervisor_hint',
          toEnvelope(
            'simulation.supervisor_hint',
            {
              sessionId: response.sessionId,
              hintText: response.hintText,
              createdAt: response.createdAt,
            },
            response.sessionId,
          ),
        );
      } catch (error: unknown) {
        const errorPayload: WsErrorPayload = {
          message:
            error instanceof Error ? error.message : 'Failed to process supervisor whisper.',
        };
        socket.emit('system.error', toEnvelope('system.error', errorPayload));
      }
    });
  }

  private subscribeSocketToSession(socket: Socket, sessionId: string): void {
    void socket.join(toRoomName(sessionId));
    logger.info('socket_session_subscribed', {
      socketId: socket.id,
      sessionId,
    });

    const payload: WsSubscriptionPayload = { sessionId };
    socket.emit('subscription.confirmed', toEnvelope('subscription.confirmed', payload, sessionId));
  }

  private unsubscribeSocketFromSession(socket: Socket, sessionId: string): void {
    void socket.leave(toRoomName(sessionId));
    logger.info('socket_session_unsubscribed', {
      socketId: socket.id,
      sessionId,
    });

    const payload: WsSubscriptionPayload = { sessionId };
    socket.emit('subscription.removed', toEnvelope('subscription.removed', payload, sessionId));
  }

  private getNamespace(channel: SimulationChannel): Namespace {
    return channel === 'supervised' ? this.supervisedNamespace : this.unsupervisedNamespace;
  }

  private broadcastToSession(
    channel: SimulationChannel,
    sessionId: string,
    eventName: string,
    payload: WsEnvelope<string, unknown>,
  ): void {
    this.getNamespace(channel).to(toRoomName(sessionId)).emit(eventName, payload);
  }

  private inferEventChannel(event: Record<string, unknown>): SimulationChannel[] {
    const eventChannel = event.channel;
    if (eventChannel === 'supervised' || eventChannel === 'unsupervised') {
      return [eventChannel];
    }

    return ['supervised', 'unsupervised'];
  }

  private broadcastRealtimeEvent(event: Record<string, unknown>): void {
    const eventType = typeof event.type === 'string' ? event.type : '';
    const sessionId = typeof event.sessionId === 'string' ? event.sessionId : undefined;
    if (!sessionId) {
      return;
    }

    const channels = this.inferEventChannel(event);

    if (eventType === 'session_created') {
      for (const channel of channels) {
        this.broadcastToSession(
          channel,
          sessionId,
          'simulation.session_created',
          toEnvelope(
            'simulation.session_created',
            {
              mode: event.mode,
              channel,
              topic: event.topic,
              metrics: event.metrics,
              communicationGraph: event.communicationGraph,
              studentStates: event.studentStates,
            },
            sessionId,
          ),
        );
      }
      return;
    }

    if (eventType === 'agent_turn_emitted') {
      for (const channel of channels) {
        this.broadcastToSession(
          channel,
          sessionId,
          'simulation.agent_turn_emitted',
          toEnvelope(
            'simulation.agent_turn_emitted',
            {
              requestTurnId: event.requestTurnId,
              emittedTurn: event.emittedTurn,
            },
            sessionId,
          ),
        );
      }
      return;
    }

    if (eventType === 'task_assignment_required') {
      for (const channel of channels) {
        this.broadcastToSession(
          channel,
          sessionId,
          'simulation.task_assignment_required',
          toEnvelope(
            'simulation.task_assignment_required',
            {
              lessonTurn: Number(event.lessonTurn ?? 0),
              phase: 'practice',
              classroomRuntime: event.classroomRuntime,
            },
            sessionId,
          ),
        );
      }
      return;
    }

    const turnPayload: WsTurnPayload = {
      turnId: String(event.turnId ?? ''),
      transcript: (event.transcript as WsTurnPayload['transcript']) ?? [],
      events: (event.events as WsTurnPayload['events']) ?? [],
      metrics: (event.metrics as WsTurnPayload['metrics']) ?? {
        engagement: 0,
        clarity: 0,
        misconceptionsDetected: 0,
        turnCount: 0,
      },
    };

    const graphPayload: WsGraphPayload = {
      turnId: String(event.turnId ?? ''),
      communicationGraph: (event.communicationGraph as WsGraphPayload['communicationGraph']) ?? {
        nodes: [],
        edges: [],
        activations: [],
        currentTurnActivations: [],
      },
      currentTurnActivations:
        (event.currentTurnActivations as WsGraphPayload['currentTurnActivations']) ?? [],
    };

    const studentStatesPayload: WsStudentStatesPayload = {
      turnId: String(event.turnId ?? ''),
      studentStates: (event.studentStates as WsStudentStatesPayload['studentStates']) ?? [],
      studentStateChanges:
        (event.studentStateChanges as WsStudentStatesPayload['studentStateChanges']) ?? [],
      classroomRuntime:
        (event.classroomRuntime as WsStudentStatesPayload['classroomRuntime']) ?? undefined,
    };

    for (const channel of channels) {
      this.broadcastToSession(
        channel,
        sessionId,
        'simulation.turn_processed',
        toEnvelope('simulation.turn_processed', turnPayload, sessionId),
      );

      this.broadcastToSession(
        channel,
        sessionId,
        'simulation.graph_updated',
        toEnvelope('simulation.graph_updated', graphPayload, sessionId),
      );

      this.broadcastToSession(
        channel,
        sessionId,
        'simulation.student_states_updated',
        toEnvelope('simulation.student_states_updated', studentStatesPayload, sessionId),
      );
    }
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

  logger.info('socket_gateway_started', {
    path: SOCKET_IO_PATH,
    namespaces: [SUPERVISED_NAMESPACE, UNSUPERVISED_NAMESPACE],
  });

  return {
    close: () => gateway.close(),
  };
};
