import pino from 'pino';
import { config } from './config';
import { createServer } from './server';

const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
        }
      : undefined,
});

logger.info('Starting server with config: %o', config);

const { close } = createServer(config.HOST, config.PORT);

function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down...`);
  close();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
