import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { ensureDirectory } from './env.js';

export const buildTransports = (config) => {
  const logDir = config.LOG_DIRECTORY || 'logs';
  ensureDirectory(logDir);

  const consoleLevel = config.SHOW_DEBUG ? 'debug' : config.LOG_LEVEL;
  const instances = [
    new transports.Console({
      level: consoleLevel,
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf((info) => `${info.timestamp} [${info.level}] ${info.message}`)
      ),
    }),
  ];

  if (logDir) {
    const fileFormat = format.combine(
      format.timestamp(),
      format.json()
    );

    instances.push(
      new DailyRotateFile({
        dirname: logDir,
        filename: '%DATE%.log',
        level: config.LOG_FILE_LEVEL || config.LOG_LEVEL,
        maxFiles: config.LOG_MAX_FILES || '14d',
        zippedArchive: true,
        format: fileFormat,
      })
    );
  }

  return instances;
};

export const createAppLogger = (config) => {
  const logger = createLogger({
    level: config.LOG_LEVEL,
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.splat(),
      format.json()
    ),
    transports: buildTransports(config),
  });

  logger.stream = {
    write: (message) => logger.info(message.trim()),
  };

  return logger;
};
