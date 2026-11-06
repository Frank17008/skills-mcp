import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SkillIndex } from '../skill/types.js';
import { searchSkill } from '../skill/search.js';
import { asErrorMessage, errorResult, jsonResult } from './helpers.js';

export function registerSearchSkill(server: McpServer, index: SkillIndex): void {
  server.registerTool(
    'search_skill',
    {
      description: 'Search text files in the skill directory using a literal string or regular expression.',
      inputSchema: {
        query: z.string().min(1),
        regex: z.boolean().optional(),
        caseSensitive: z.boolean().optional(),
        maxResults: z.number().int().min(1).max(200).optional(),
        contextLines: z.number().int().min(0).max(5).optional(),
        pathPrefix: z.string().optional(),
      },
    },
    async (params) => {
      try {
        return jsonResult(await searchSkill(index, params));
      } catch (error) {
        return errorResult(asErrorMessage(error));
      }
    },
  );
}
