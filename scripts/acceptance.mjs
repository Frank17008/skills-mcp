import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const skillDir = process.argv[2];
if (!skillDir) {
  throw new Error('Usage: node scripts/acceptance.mjs <skill-dir>');
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['/home/Code/skills-mcp/dist/index.js', skillDir],
});
const client = new Client({ name: 'acceptance', version: '1.0.0' });
await client.connect(transport);

const tools = await client.listTools();
const toolNames = tools.tools.map((tool) => tool.name).sort();
console.log('tools:', toolNames.join(', '));
for (const expected of ['get_skill_info', 'list_files', 'read_file', 'search_skill']) {
  if (!toolNames.includes(expected)) throw new Error(`Missing tool: ${expected}`);
}

const resources = await client.listResources();
const nonComponentDocs = new Set([
  'changelog.zh-CN.md',
  'components.zh-CN.md',
  'guide.zh-CN.md',
  'index.zh-CN.md',
]);
const docsPrefix = 'skill://references/docs/';
const componentDocs = resources.resources.filter((resource) => {
  if (!resource.uri.startsWith(docsPrefix)) return false;
  return !nonComponentDocs.has(decodeURIComponent(resource.uri.slice(docsPrefix.length)));
});
console.log('resources:', resources.resources.length, 'componentDocs:', componentDocs.length);
if (componentDocs.length !== 36) {
  throw new Error(`Expected 36 component docs, got ${componentDocs.length}`);
}

const info = await client.callTool({ name: 'get_skill_info', arguments: {} });
const infoText = info.content[0].text;
console.log('info:', infoText.slice(0, 300));
if (!infoText.includes('pcloud-components-usage')) throw new Error('Skill name missing from get_skill_info');

const files = await client.callTool({ name: 'list_files', arguments: {} });
console.log('files:', files.content[0].text.slice(0, 300));

const search = await client.callTool({
  name: 'search_skill',
  arguments: { query: 'DForm', pathPrefix: 'references/docs/DForm.md', maxResults: 3 },
});
const searchText = search.content[0].text;
console.log('search:', searchText.slice(0, 500));
if (!searchText.includes('references/docs/DForm.md')) throw new Error('DForm.md not found by search');

const read = await client.callTool({
  name: 'read_file',
  arguments: { path: 'references/docs/DForm.md', offset: 1, limit: 5 },
});
const readText = read.content[0].text;
console.log('read:', readText.slice(0, 300));
if (!readText.includes('DForm')) throw new Error('DForm.md content missing');

await client.close();
