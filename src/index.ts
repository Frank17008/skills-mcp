import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseCliArgs, USAGE } from './cli.js';
import { loadSkill } from './skill/loader.js';
import { createServer, SERVER_VERSION } from './server.js';
import { logger } from './logger.js';

async function start(skillDir: string): Promise<void> {
  const index = await loadSkill(skillDir);
  const server = createServer(index);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(`Serving skill "${index.meta.name}" from ${index.root} (${index.files.length} files)`);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down`);
    await server.close();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (options.version) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }

  await start(options.skillDir);
}

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.stack ?? error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  logger.error(`Unhandled rejection: ${message}`);
  process.exit(1);
});

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
