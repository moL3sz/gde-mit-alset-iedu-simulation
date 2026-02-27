import cors from 'cors';
import express from 'express';

import { apiRoutes } from './core/routes';
import { errorHandler } from './core/shared/middlewares/error-handler';
import { authPlaceholderMiddleware } from './core/shared/middlewares/auth-placeholder';
import { notFoundHandler } from './core/shared/middlewares/not-found-handler';
import { requestIdMiddleware } from './core/shared/middlewares/request-id';
import { requestLoggerMiddleware } from './core/shared/middlewares/request-logger';

const app = express();

app.disable('x-powered-by');
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(authPlaceholderMiddleware);

app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
