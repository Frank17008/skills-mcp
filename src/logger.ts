const PREFIX = '[skills-mcp]';

type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string): void {
  process.stderr.write(`${PREFIX} ${level}: ${message}\n`);
}

export const logger = {
  info: (message: string): void => write('info', message),
  warn: (message: string): void => write('warn', message),
  error: (message: string): void => write('error', message),
};
