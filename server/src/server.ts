import type { Server } from 'node:http';

import { app } from './app';
import { env } from './config/env';
import { attachSimulationWebSocketGateway } from './core/realtime/websocketGateway';
import { logger } from './core/shared/logger';
import { AppDataSource } from './database/data-source';
import { sessionsService } from './modules/sessions/sessions.service';

const bootstrap = async (): Promise<void> => {
  await AppDataSource.initialize();
  logger.info('database_connected', {
    host: env.DB_HOST,
    database: env.DB_NAME,
  });

  const server: Server = app.listen(env.PORT, () => {
    logger.info('server_started', {
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
    });
  });

  const webSocketGateway = attachSimulationWebSocketGateway(server, {
    submitSupervisorHint: (sessionId, hintText) =>
      sessionsService.submitSupervisorHint(sessionId, hintText),
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info('shutdown_signal_received', { signal });
    webSocketGateway.close();

    server.close(async (error) => {
      if (error) {
        logger.error('shutdown_failed', {
          signal,
          error: error.message,
        });
        process.exit(1);
        return;
      }

      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }

      logger.info('shutdown_complete', { signal });
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

void bootstrap().catch((error: unknown) => {
  logger.error('bootstrap_failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
