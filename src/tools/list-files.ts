import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SkillIndex } from '../skill/types.js';
import { matchesPrefix, normalizePrefix } from '../skill/safety.js';
import { asErrorMessage, errorResult, jsonResult } from './helpers.js';

export interface ListedFile {
  path: string;
  size: number;
  title?: string;
  mimeType: string;
  isText: boolean;
}

export interface ListFilesPayload {
  count: number;
  files: ListedFile[];
}

export function listFilesPayload(index: SkillIndex, dir?: string): ListFilesPayload {
  const prefix = normalizePrefix(dir);
  const files = index.files
    .filter((file) => matchesPrefix(file.relPath, prefix))
    .map((file) => ({
      path: file.relPath,
      size: file.size,
      title: file.title,
      mimeType: file.mimeType,
      isText: file.isText,
    }));
  return { count: files.length, files };
}

export function registerListFiles(server: McpServer, index: SkillIndex): void {
  server.registerTool(
    'list_files',
    {
      description: 'List files in the skill directory, optionally filtered by a directory prefix.',
      inputSchema: {
        dir: z.string().optional(),
      },
    },
    async ({ dir }) => {
      try {
        return jsonResult(listFilesPayload(index, dir));
      } catch (error) {
        return errorResult(asErrorMessage(error));
      }
    },
  );
}
