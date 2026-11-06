import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadSkill } from '../src/skill/loader.js';
import { createServer } from '../src/server.js';

const FIXTURE = path.resolve(process.cwd(), 'test/fixtures/sample-skill');

let server: McpServer;
let client: Client;

function parseToolJson(result: object): unknown {
  if (!('content' in result)) {
    throw new Error('Expected a text tool result');
  }

  const content = result.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error('Expected a text tool result');
  }

  const first: unknown = content[0];
  if (
    typeof first !== 'object' ||
    first === null ||
    !('type' in first) ||
    first.type !== 'text' ||
    !('text' in first) ||
    typeof first.text !== 'string'
  ) {
    throw new Error('Expected a text tool result');
  }

  return JSON.parse(first.text);
}

beforeAll(async () => {
  const index = await loadSkill(FIXTURE);
  server = createServer(index);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  client = new Client({ name: 'skills-mcp-test-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  await server.close();
});

describe('skills-mcp integration', () => {
  it('registers exactly the four documented tools', async () => {
    const result = await client.listTools();
    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      'get_skill_info',
      'list_files',
      'read_file',
      'search_skill',
    ]);
  });

  it('lists text resources and excludes binary files', async () => {
    const result = await client.listResources();
    const uris = result.resources.map((resource) => resource.uri);

    expect(uris).toContain('skill://SKILL.md');
    expect(uris).toContain('skill://references/a.md');
    expect(uris).toContain('skill://references/nested/deep.md');
    expect(uris).not.toContain('skill://assets/binary.png');
  });

  it('returns skill info', async () => {
    const result = await client.callTool({ name: 'get_skill_info', arguments: {} });
    const payload = parseToolJson(result) as { name: string; fileCount: number };

    expect(result.isError).not.toBe(true);
    expect(payload.name).toBe('sample-skill');
    expect(payload.fileCount).toBeGreaterThanOrEqual(4);
  });

  it('reads a file', async () => {
    const result = await client.callTool({
      name: 'read_file',
      arguments: { path: 'references/a.md' },
    });
    const payload = parseToolJson(result) as { content: string; totalLines: number };

    expect(result.isError).not.toBe(true);
    expect(payload.content).toContain('alpha beta gamma');
    expect(payload.totalLines).toBeGreaterThan(0);
  });

  it('searches the skill', async () => {
    const result = await client.callTool({
      name: 'search_skill',
      arguments: { query: 'alpha', contextLines: 0 },
    });
    const payload = parseToolJson(result) as { total: number; results: Array<{ path: string }> };

    expect(result.isError).not.toBe(true);
    expect(payload.total).toBe(2);
    expect(payload.results[0].path).toBe('references/a.md');
  });

  it('reads a resource', async () => {
    const result = await client.readResource({ uri: 'skill://references/a.md' });
    const first = result.contents[0];

    expect(first.uri).toBe('skill://references/a.md');
    expect(first.mimeType).toBe('text/markdown');
    expect('text' in first ? first.text : '').toContain('alpha');
  });

  it('rejects path traversal', async () => {
    const result = await client.callTool({
      name: 'read_file',
      arguments: { path: '../package.json' },
    });

    expect(result.isError).toBe(true);
    expect(Array.isArray(result.content)).toBe(true);
  });

  it('rejects binary file reads', async () => {
    const result = await client.callTool({
      name: 'read_file',
      arguments: { path: 'assets/binary.png' },
    });

    expect(result.isError).toBe(true);
  });
});
