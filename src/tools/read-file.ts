import fs from 'node:fs';
import readline from 'node:readline';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SkillIndex } from '../skill/types.js';
import {
  assertRealPathWithinRoot,
  getMaxReadBytes,
  normalizeRelPath,
} from '../skill/safety.js';
import { asErrorMessage, errorResult, jsonResult } from './helpers.js';

export interface FileWindow {
  totalLines: number;
  returnedLines: number;
  truncated: boolean;
  content: string;
}

export async function readFileWindow(
  absPath: string,
  offset: number,
  limit: number,
  maxBytes: number,
): Promise<FileWindow> {
  const stream = fs.createReadStream(absPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const collected: string[] = [];
  let totalLines = 0;
  let returnedLines = 0;
  let bytes = 0;

  try {
    for await (const line of rl) {
      totalLines++;

      if (totalLines < offset) continue;
      if (returnedLines >= limit) continue;

      const lineBytes = Buffer.byteLength(line, 'utf8') + (returnedLines > 0 ? 1 : 0);
      if (bytes + lineBytes > maxBytes) {
        if (returnedLines === 0) {
          throw new Error(`Line too long (exceeds ${maxBytes} bytes). Increase SKILL_MCP_MAX_READ_BYTES.`);
        }
        continue;
      }

      collected.push(line);
      bytes += lineBytes;
      returnedLines++;
    }
  } finally {
    rl.close();
    stream.close();
  }

  return {
    totalLines,
    returnedLines,
    truncated: offset - 1 + returnedLines < totalLines,
    content: collected.join('\n'),
  };
}

export function registerReadFile(server: McpServer, index: SkillIndex): void {
  server.registerTool(
    'read_file',
    {
      description: 'Read a text file from the skill directory by relative path, with line-based pagination.',
      inputSchema: {
        path: z.string().min(1),
        offset: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(10000).optional(),
      },
    },
    async ({ path: inputPath, offset = 1, limit = 2000 }) => {
      try {
        const relPath = normalizeRelPath(inputPath);
        const entry = index.files.find((file) => file.relPath === relPath);
        if (!entry) {
          return errorResult(`File not found: ${relPath}. Call list_files to see available files.`);
        }
        if (!entry.isText) {
          return errorResult(`Binary file cannot be read as text: ${relPath}`);
        }

        await assertRealPathWithinRoot(index.root, entry.absPath);
        const window = await readFileWindow(entry.absPath, offset, limit, getMaxReadBytes());
        return jsonResult({ path: relPath, offset, limit, ...window });
      } catch (error) {
        return errorResult(asErrorMessage(error));
      }
    },
  );
}
