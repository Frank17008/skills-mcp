import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SkillIndex } from './skill/types.js';
import { registerGetSkillInfo } from './tools/get-skill-info.js';
import { registerListFiles } from './tools/list-files.js';
import { registerReadFile } from './tools/read-file.js';
import { registerSearchSkill } from './tools/search-skill.js';
import { registerResources } from './resources/register.js';

export const SERVER_NAME = 'skills-mcp';
export const SERVER_VERSION = '0.1.0';

export function createServer(index: SkillIndex): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  registerGetSkillInfo(server, index);
  registerListFiles(server, index);
  registerReadFile(server, index);
  registerSearchSkill(server, index);
  registerResources(server, index);

  return server;
}
