# skills-mcp

Generic stdio MCP server that exposes a single Markdown skill directory through tools and resources.

Given any directory containing `SKILL.md` (with optional `references/` and other files), `skills-mcp` lets an MCP client:

- inspect skill metadata and the file tree
- list files
- read text files with line pagination
- search text files by literal string or regular expression
- read every text file as a `skill://` resource

## Requirements

- Node.js >= 20

## Usage

```bash
npx -y @frank17008/skills-mcp /path/to/skill
```

Or with the explicit flag:

```bash
npx -y @frank17008/skills-mcp --skill /path/to/skill
```

If no directory is given, the current working directory is used.

## OpenCode

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "pcloud-components": {
      "type": "local",
      "command": ["npx", "-y", "@frank17008/skills-mcp", "/home/Code/skills/pcloud-components-usage"],
      "enabled": true
    }
  }
}
```

## Claude Desktop

```json
{
  "mcpServers": {
    "pcloud-components": {
      "command": "npx",
      "args": ["-y", "@frank17008/skills-mcp", "/home/Code/skills/pcloud-components-usage"]
    }
  }
}
```

Cursor (`.cursor/mcp.json`) uses the same shape as Claude Desktop.

## Tools

| Tool | Purpose |
| --- | --- |
| `get_skill_info` | Skill metadata, root, file counts, file tree |
| `list_files` | List files, optionally filtered by a directory prefix |
| `read_file` | Read a text file with `offset` / `limit` line pagination |
| `search_skill` | Literal or regex search across text files |

## Resources

Every text file is exposed as `skill://<relative-path>`, for example:

- `skill://SKILL.md`
- `skill://references/docs/DForm.md`

Binary files are listed by `list_files` with `isText: false` but are not exposed as resources.

## Configuration

| Environment variable | Default | Description |
| --- | --- | --- |
| `SKILL_MCP_MAX_READ_BYTES` | `1048576` (1 MiB) | Max bytes returned by one `read_file` call, max text file size scanned by `search_skill`, and max size for resource reads |

## Notes

- One server serves one skill directory.
- stdio transport only.
- The file list is captured at startup; newly added or deleted files require a restart. Content changes to existing files are read live.
- stdout is reserved for MCP JSON-RPC; logs go to stderr.

## Development

```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm install
npm run typecheck
npm test
npm run build
```
