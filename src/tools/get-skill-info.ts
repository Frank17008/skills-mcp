import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SkillIndex } from '../skill/types.js';
import { jsonResult } from './helpers.js';

export interface SkillInfoPayload {
  name: string;
  description: string;
  version?: string;
  lastUpdated?: string;
  root: string;
  fileCount: number;
  textFileCount: number;
  tree: string[];
}

export function getSkillInfoPayload(index: SkillIndex): SkillInfoPayload {
  return {
    name: index.meta.name,
    description: index.meta.description,
    version: index.meta.version,
    lastUpdated: index.meta.lastUpdated,
    root: index.root,
    fileCount: index.files.length,
    textFileCount: index.files.filter((file) => file.isText).length,
    tree: index.files.map((file) => file.relPath),
  };
}

export function registerGetSkillInfo(server: McpServer, index: SkillIndex): void {
  server.registerTool(
    'get_skill_info',
    {
      description: 'Return skill metadata, root path, file counts, and the full file tree.',
      inputSchema: {},
    },
    async () => jsonResult(getSkillInfoPayload(index)),
  );
}
