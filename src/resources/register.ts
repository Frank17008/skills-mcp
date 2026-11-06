import fs from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SkillIndex } from '../skill/types.js';
import { assertRealPathWithinRoot, getMaxReadBytes } from '../skill/safety.js';
import { logger } from '../logger.js';

export function resourceUri(relPath: string): string {
  return `skill://${relPath.split('/').map(encodeURIComponent).join('/')}`;
}

export function decodeResourceUri(uri: URL): string {
  const raw = uri.href.replace(/^skill:\/\//, '');
  return raw.split('/').map(decodeURIComponent).join('/');
}

export function registerResources(server: McpServer, index: SkillIndex): void {
  let registered = 0;

  for (const file of index.files) {
    if (!file.isText) continue;

    server.registerResource(
      file.relPath,
      resourceUri(file.relPath),
      {
        title: file.title ?? file.relPath,
        description: file.title ?? file.relPath,
        mimeType: file.mimeType,
        size: file.size,
      },
      async (requestedUri) => {
        const relPath = decodeResourceUri(requestedUri);
        const entry = index.files.find((candidate) => candidate.relPath === relPath);
        if (!entry) throw new Error(`Resource not found: ${relPath}`);
        if (!entry.isText) throw new Error(`Binary resource cannot be read as text: ${relPath}`);

        await assertRealPathWithinRoot(index.root, entry.absPath);
        const stat = await fs.promises.stat(entry.absPath);
        const maxBytes = getMaxReadBytes();
        if (stat.size > maxBytes) {
          throw new Error(
            `File too large for resource read (${stat.size} bytes, limit ${maxBytes}). Use read_file with offset/limit.`,
          );
        }

        const text = await fs.promises.readFile(entry.absPath, 'utf8');
        return {
          contents: [{ uri: requestedUri.href, mimeType: entry.mimeType, text }],
        };
      },
    );
    registered++;
  }

  logger.info(`Registered ${registered} resources`);
}
