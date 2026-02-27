import type { Server } from 'node:http';

import { app } from './app';
import { env } from './config/env';
import { sessionsService } from './core/modules/sessions/sessions.service';
import { attachSimulationWebSocketGateway } from './core/realtime/websocketGateway';
import { logger } from './core/shared/logger';

const server: Server = app.listen(env.PORT, () => {
  logger.info('server_started', {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
  });
});
const webSocketGateway = attachSimulationWebSocketGateway(server, {
  submitSupervisorHint: (sessionId, hintText) => sessionsService.submitSupervisorHint(sessionId, hintText),
});

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info('shutdown_signal_received', { signal });
  webSocketGateway.close();

  server.close((error) => {
    if (error) {
      logger.error('shutdown_failed', {
        signal,
        error: error.message,
      });
      process.exit(1);
      return;
    }

    logger.info('shutdown_complete', { signal });
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
