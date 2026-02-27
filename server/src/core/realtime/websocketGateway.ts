import type { Server as HttpServer } from 'node:http';

import { Server as SocketIoServer, type Socket } from 'socket.io';

import type {
  RealtimeClientCommand,
  SimulationRealtimeEvent,
  WsConnectedPayload,
  WsEnvelope,
  WsErrorPayload,
  WsGraphPayload,
  WsStudentStatesPayload,
  WsSubscriptionPayload,
  WsTurnPayload,
} from '../@types';
import { registerSocketCommandHandlers } from './socketCommandHandlers';
import { simulationRealtimeBus } from './simulationRealtimeBus';

const SOCKET_IO_PATH = '/socket.io';

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

class SimulationSocketGateway {
  private readonly io: SocketIoServer;
  private readonly unsubscribeRealtime: () => void;

  public constructor(server: HttpServer) {
    this.io = new SocketIoServer(server, {
      path: SOCKET_IO_PATH,
      cors: {
        origin: true,
        credentials: true,
      },
    });

    this.io.on('connection', this.handleConnection);
    this.unsubscribeRealtime = simulationRealtimeBus.subscribe((event) => {
      this.broadcastRealtimeEvent(event);
    });
  }

  public close(): void {
    this.unsubscribeRealtime();
    void this.io.close();
  }

  private readonly handleConnection = (socket: Socket): void => {
    registerSocketCommandHandlers(socket);

    const connectedPayload: WsConnectedPayload = {
      connectionId: socket.id,
      endpoint: '/socket.io',
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
  };

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
        event.sessionId,
        'simulation.session_created',
        toEnvelope(
          'simulation.session_created',
          {
            mode: event.mode,
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
      event.sessionId,
      'simulation.turn_processed',
      toEnvelope('simulation.turn_processed', turnPayload, event.sessionId),
    );

    this.broadcastToSession(
      event.sessionId,
      'simulation.graph_updated',
      toEnvelope('simulation.graph_updated', graphPayload, event.sessionId),
    );

    this.broadcastToSession(
      event.sessionId,
      'simulation.student_states_updated',
      toEnvelope('simulation.student_states_updated', studentStatesPayload, event.sessionId),
    );
  }

  private broadcastToSession(
    sessionId: string,
    eventName: string,
    payload: WsEnvelope<string, unknown>,
  ): void {
    this.io.to(toRoomName(sessionId)).emit(eventName, payload);
  }
}

export interface WebSocketGateway {
  close(): void;
}

export const attachSimulationWebSocketGateway = (server: HttpServer): WebSocketGateway => {
  const gateway = new SimulationSocketGateway(server);

  return {
    close: () => gateway.close(),
  };
};
