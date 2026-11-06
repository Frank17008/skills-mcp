# skills-mcp 设计文档

- 日期：2026-11-06
- 状态：已评审（待实现）
- 仓库：`/home/Code/skills-mcp`（独立仓库，npm 包名建议 `@frank17008/skills-mcp`）

## 1. 背景与目标

现有 `/home/Code/skills` 仓库用 Markdown 组织 skill（`SKILL.md` + `references/`），agent 需要**全量加载**才能使用，无法按需检索。

本项目做一个**通用的 skills → MCP 转换器**：给定任意一个 skill 目录，启动一个 stdio MCP server，把该 skill 的元数据、文件列表、文件内容和全文搜索结果通过 **Tools + Resources** 暴露给 MCP 客户端。

目标：

1. 对任意符合「目录 + `SKILL.md`（可带 `references/` 等任意文件）」结构的 skill 开箱即用。
2. 不需要预生成索引文件、不需要改动 skill 本身。
3. 内容按需读盘，文件内容修改后无需重启即可读到新内容。
4. 适配 OpenCode / Claude Desktop / Cursor 等支持 stdio MCP 的客户端。

## 2. 非目标（本期不做）

- 不支持多个 skill 同时服务（一个 server 只服务一个 skill 目录）。
- 不做 HTTP / SSE transport，只做 stdio。
- 不生成或改写文档，只读取已有文件。
- 不做鉴权、多用户、远端部署。
- 不做语义/向量检索，只做字面量 + 正则搜索。
- 不做 prompts（只暴露 Tools + Resources）。

## 3. 关键决策

| 项 | 决策 | 理由 |
|---|---|---|
| 运行环境 | Node.js >= 20，TypeScript，ESM | 与 MCP 生态一致，`node:util.parseArgs` 可直接用 |
| MCP SDK | `@modelcontextprotocol/sdk` `^1.32.2`（npm latest） | 稳定版本，`registerTool` / `registerResource` / `InMemoryTransport` 均可用 |
| 传输 | 仅 `StdioServerTransport` | 兼容性最好，配置最简单 |
| 服务范围 | 一个 server 只加载一个 skill 目录 | 用户明确选择 |
| 实现策略 | 轻量直读（启动时只建元数据索引，内容按需读盘） | 内存低、内容变更实时生效 |
| 能力面 | Tools + Resources | 用户明确选择 |
| skill 目录指定 | `--skill <dir>` > 位置参数 > 当前工作目录 | 灵活且可写进 MCP 配置 |
| 包名 | `@frank17008/skills-mcp` | 沿用现有 npm scope，规避 `skills-mcp` 被占用 |
| 元数据解析 | `gray-matter` 解析 `SKILL.md` frontmatter | 标准 YAML frontmatter，容错好 |
| 参数校验 | `zod`（SDK 已依赖） | 与 SDK inputSchema 一致 |

## 4. 术语

- **skill 目录（root）**：包含 `SKILL.md` 的目录，绝对路径。
- **relPath**：相对 root 的 POSIX 路径（始终用 `/` 分隔），如 `references/docs/DForm.md`。
- **文本文件**：通过扩展名 + NUL 字节嗅探判定为文本的文件；只有文本文件可被搜索和 `read_file` 读取。
- **索引快照**：启动时扫描生成的元数据集合；运行期新增/删除文件需要重启才会反映，已有文件的内容修改实时生效。

## 5. 架构

### 5.1 目录结构

```
skills-mcp/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── README.md
├── src/
│   ├── index.ts              # CLI 入口：解析参数、启动/关闭 server
│   ├── server.ts             # createServer(index): 注册 tools/resources
│   ├── logger.ts             # 只写 stderr 的日志
│   ├── skill/
│   │   ├── types.ts          # SkillIndex / SkillFileEntry / SkillMeta
│   │   ├── loader.ts         # loadSkill(root)
│   │   ├── search.ts         # searchSkill(index, params)
│   │   └── safety.ts         # 路径/大小/二进制判定
│   ├── tools/
│   │   ├── get-skill-info.ts
│   │   ├── list-files.ts
│   │   ├── read-file.ts
│   │   ├── search-skill.ts
│   │   └── helpers.ts        # 统一 tool 结果/错误构造
│   └── resources/
│       └── register.ts       # 为每个文本文件注册 skill:// 资源
└── test/
    ├── fixtures/sample-skill/
    │   ├── SKILL.md
    │   ├── references/a.md
    │   ├── references/nested/deep.md
    │   └── assets/binary.png  # 含 NUL 字节的假二进制
    ├── loader.test.ts
    ├── safety.test.ts
    ├── search.test.ts
    ├── read-file.test.ts
    └── server.integration.test.ts
```

### 5.2 数据模型

```ts
type SkillMeta = {
  name: string;          // frontmatter.name，缺失时用 root 目录名
  description: string;   // frontmatter.description，缺失时为 ''
  version?: string;
  lastUpdated?: string;
  [key: string]: unknown; // 保留其他 frontmatter 字段
};

type SkillFileEntry = {
  relPath: string;   // POSIX 相对路径，唯一
  absPath: string;   // realpath 后的绝对路径
  size: number;      // 字节数
  mimeType: string;
  title?: string;    // .md 文件首个一级标题
  isText: boolean;
};

type SkillIndex = {
  root: string;           // 绝对路径（realpath）
  skillFilePath: string;  // SKILL.md 绝对路径
  meta: SkillMeta;
  files: SkillFileEntry[]; // 按 relPath 升序
};
```

### 5.3 加载流程 `loadSkill(root)`

1. `root` 不存在、不是目录 → 抛错，CLI 捕获后 stderr 输出并 `exit 1`。
2. `fs.realpath(root)` 得到 `realRoot`。
3. 校验 `realRoot/SKILL.md` 存在且是文件；否则抛错退出。
4. 用 `gray-matter` 解析 `SKILL.md`：
   - 解析成功：取 `data` 作为 meta。
   - 无 frontmatter：meta 为空。
   - YAML 损坏：stderr 警告，meta 为空，**不崩溃**。
   - `name` 缺失 → `path.basename(realRoot)`；`description` 缺失 → `''`。
5. 递归扫描目录，生成 `files`（规则见 5.4）。
6. 按 `relPath` 升序排序，返回 `SkillIndex`。

### 5.4 文件扫描规则

- 递归 `readdir({ withFileTypes: true })`。
- 跳过目录/文件名：`.git`、`node_modules`、`dist`、`.DS_Store`。
- 符号链接：
  - 遍历条目按名称升序，保证顺序确定；
  - `realpath` 后仍在 `realRoot` 内 → 收录，`relPath` 记录链接所在相对路径，`absPath` 记录真实路径；
  - 解析到 `realRoot` 外 → 跳过并写 stderr 警告；
  - 按 `absPath`（realpath）去重，先遍历到的条目优先；目录软链额外用已访问 realpath 集合防止循环。
- 文件大小取 `stat.size`。
- `isText` 判定见 8.3。
- 文本 `.md` 文件提取 `title`：第一行匹配 `/^#\s+(.+?)\s*$/` 的内容，找不到则 `undefined`。
- 单个文件扫描失败（权限等）→ 跳过 + stderr 警告，不中断整体加载。

### 5.5 MIME 映射

| 扩展名 | mimeType |
|---|---|
| `.md` `.markdown` | `text/markdown` |
| `.txt` | `text/plain` |
| `.json` | `application/json` |
| `.yaml` `.yml` | `application/yaml` |
| `.toml` | `application/toml` |
| `.xml` | `application/xml` |
| `.html` `.htm` | `text/html` |
| `.css` `.less` `.scss` | `text/css` |
| `.csv` | `text/csv` |
| `.sh` `.bash` | `text/x-sh` |
| `.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs` | `text/plain` |
| 其他文本 | `text/plain` |

非文本文件不注册 resource，但仍出现在 `list_files` 结果中（`isText: false`）。

## 6. MCP 接口

### 6.1 Tools

所有 tool 正常返回：`{ content: [{ type: 'text', text: <JSON string> }] }`，JSON 为下述结构。
所有 tool 失败返回：`{ content: [{ type: 'text', text: <错误消息> }], isError: true }`。

#### `get_skill_info`

- 入参：`{}`
- 返回 JSON：

```ts
{
  name: string;
  description: string;
  version?: string;
  lastUpdated?: string;
  root: string;
  fileCount: number;
  textFileCount: number;
  tree: string[]; // 所有 relPath，按升序
}
```

#### `list_files`

- 入参 schema：
```ts
z.object({ dir: z.string().optional() })
```
- `dir` 为 relPath 前缀过滤（如 `references/docs`，路径段匹配，见 §8.1）；不传则返回全部；不是真实文件系统查询，只过滤索引。
- 返回 JSON：
```ts
{ count: number; files: Array<{ path: string; size: number; title?: string; mimeType: string; isText: boolean }> }
```

#### `read_file`

- 入参 schema：
```ts
z.object({
  path: z.string().min(1),
  offset: z.number().int().min(1).optional(),   // 1-based 起始行，默认 1
  limit: z.number().int().min(1).max(10000).optional(), // 默认 2000
})
```
- `path` 必须存在于启动索引（relPath，精确匹配，允许 `./` 前缀被规范化）。不存在 → `isError`，提示先调用 `list_files`。
- 非文本文件 → `isError`（"Binary file cannot be read as text"）。
- 按行流式读取：从 `offset` 行开始，最多返回 `limit` 行，且单次返回内容不超过 `MAX_READ_BYTES`（在行边界截断）。
  - 文件总大小不受 `MAX_READ_BYTES` 限制，大文件通过 `offset` / `limit` 分页读取。
  - 若单行本身超过 `MAX_READ_BYTES` → `isError`，提示增大 `SKILL_MCP_MAX_READ_BYTES`。
- 返回 JSON：
```ts
{ path: string; offset: number; limit: number; totalLines: number; returnedLines: number; truncated: boolean; content: string }
```
- `totalLines` 通过流式计数得到，不整体载入内存。
- `truncated = (offset - 1 + returnedLines) < totalLines`，表示后面还有未返回的行。

#### `search_skill`

- 入参 schema：
```ts
z.object({
  query: z.string().min(1),
  regex: z.boolean().optional(),            // 默认 false
  caseSensitive: z.boolean().optional(),    // 默认 false
  maxResults: z.number().int().min(1).max(200).optional(), // 默认 50
  contextLines: z.number().int().min(0).max(5).optional(), // 默认 2
  pathPrefix: z.string().optional(),        // relPath 前缀过滤（路径段匹配，见 §8.1）
})
```
- 只搜索文本文件；大小超过 `MAX_READ_BYTES` 的文件跳过并计入 `skippedLarge`，这类文件可用 `read_file` 分页读取。
- `regex: true` 时把 `query` 当正则；非法正则 → `isError`。
- 逐行匹配：同一行出现多处命中只计为一条结果，`column` 取首个命中位置；命中行前后各取 `contextLines` 行作为 `snippet`（用 `\n` 连接）。
- 返回 JSON：
```ts
{
  query: string;
  total: number;      // 命中行数（可能大于 results.length）
  limited: boolean;   // 是否因 maxResults 截断
  skippedBinary: number;
  skippedLarge: number;
  results: Array<{ path: string; line: number; column: number; snippet: string }>;
}
```
- `line` / `column` 均为 1-based。
- `skippedBinary` 统计范围内所有非文本文件数；`skippedLarge` 统计因超过 `MAX_READ_BYTES` 而未扫描的文本文件数。

### 6.2 Resources

- 为索引中每个 `isText: true` 的文件注册一个固定资源：
  - URI：`skill://` + 对 relPath 按 `/` 分段 `encodeURIComponent` 再拼接，例如：
    - `skill://SKILL.md`
    - `skill://references/docs/DForm.md`
  - `name`：relPath
  - `title`：`title ?? relPath`
  - `description`：`title ?? relPath`
  - `mimeType`：见 5.5
- 读取回调：
  1. 从 URI 去掉 `skill://` 前缀，逐段 `decodeURIComponent` 还原 relPath；
  2. 在索引中精确查找；找不到 → 抛错；
  3. 重新 `realpath` 并校验仍在 root 内；
  4. 若文件大小超过 `MAX_READ_BYTES` → 抛错，提示使用 `read_file` 的 `offset` / `limit` 分页读取；
  5. 按 UTF-8 读取，返回 `{ contents: [{ uri: uri.href, mimeType, text }] }`。
- 非文本文件不注册；`resources/list` 只返回文本文件。
- 资源在启动时一次性注册，运行期新增文件不会出现在 `resources/list`，需重启。

### 6.3 启动与关闭

1. 解析 CLI 参数，确定 skill 目录。
2. `loadSkill()` 失败 → stderr 输出错误，`process.exit(1)`。
3. `createServer(index)` 注册 tools/resources。
4. `new StdioServerTransport()`，`await server.connect(transport)`。
5. 监听 `SIGINT` / `SIGTERM`：关闭 server 后 `exit(0)`。
6. 监听 `uncaughtException` / `unhandledRejection`：stderr 输出后 `exit(1)`。

## 7. CLI

使用 `node:util.parseArgs`。

```
skills-mcp [skillDir] [--skill <dir>] [--help] [--version]

Options:
  -s, --skill <dir>   skill 目录（包含 SKILL.md）
  -h, --help          显示帮助
  -v, --version       显示版本
```

- 目录优先级：`--skill` > 第一个位置参数 > `process.cwd()`。
- 多个位置参数 → 报错退出 1。
- `--skill` 与位置参数同时存在且不同 → 使用 `--skill`，stderr 警告。
- `--help` / `--version` 输出到 stdout 后退出 0（此时不启动 MCP，不违反 stdout 纪律）。

## 8. 安全与错误处理

### 8.1 路径解析算法

由于 `read_file` / `search_skill.pathPrefix` / resources 都只接受**索引内**的 relPath，安全策略为：

1. 输入拒绝：包含 `\0`、绝对路径（`path.isAbsolute`）→ 抛错。
2. 统一分隔符为 `/`，用 `path.posix.normalize` 规范化。
3. 规范化为 `..` 或以 `../` 开头 → 抛错。
4. `read_file` / resources 只接受索引中存在的 `relPath`（精确匹配）。
5. `list_files.dir` 与 `search_skill.pathPrefix` 先按步骤 1–3 规范化，并去掉末尾的 `/`（除非为空），再做**路径段前缀**匹配：`relPath === prefix` 或 `relPath.startsWith(prefix + '/')`；不触碰文件系统。
6. 读取前再对 `absPath` 做一次 `fs.realpath`，确认仍在 `realpath(root)` 内；否则抛错。

扫描阶段已经过滤掉指向 root 外的符号链接，因此索引天然不含越界路径。

### 8.2 限制

| 项 | 默认值 | 覆盖方式 |
|---|---|---|
| `MAX_READ_BYTES`（单次读取返回上限 / 搜索单文件扫描上限 / resource 单文件读取上限） | 1 MiB（1048576） | 环境变量 `SKILL_MCP_MAX_READ_BYTES`（正整数） |
| `read_file.limit` | 2000 行 | 入参，最大 10000 |
| `search_skill.maxResults` | 50 | 入参，最大 200 |
| `search_skill.contextLines` | 2 | 入参，最大 5 |

环境变量非法（非正整数）→ stderr 警告并使用默认值。

### 8.3 二进制判定

1. 已知二进制扩展名直接判为非文本：
   `.png .jpg .jpeg .gif .webp .ico .bmp .pdf .zip .gz .tar .rar .7z .woff .woff2 .ttf .eot .mp4 .mp3 .wav .webm .wasm .exe .dll .so .dylib .bin`
2. 其他文件读前 8192 字节，含 `0x00` → 非文本。
3. 读取失败 → 非文本。
4. 只有文本文件可被 `read_file` 与 `search_skill` 处理；读取二进制返回 `isError`。

### 8.4 日志与 stdout 纪律

- **stdout 只能输出 MCP JSON-RPC**。所有日志统一走 `src/logger.ts`，写 `process.stderr`，前缀 `[skills-mcp]`。
- 业务代码禁止使用 `console.log`，统一通过 `src/logger.ts` 写 stderr；ESLint 规则不在本期范围（见 §13）。
- `--help` / `--version` 是 CLI 模式，可写 stdout。

### 8.5 错误消息约定

错误消息需可操作，例如：

- `Skill directory not found: <path>`
- `SKILL.md not found in skill directory: <path>`
- `File not found: <relPath>. Call list_files to see available files.`
- `Path outside skill directory is not allowed: <input>`
- `Binary file cannot be read as text: <relPath>`
- `Line too long (exceeds <limit> bytes). Increase SKILL_MCP_MAX_READ_BYTES.`（`read_file` 单行超限）
- `File too large for resource read (<size> bytes, limit <limit>). Use read_file with offset/limit.`（resource 读取超限）
- `Invalid regular expression: <message>`

## 9. 测试策略

测试框架：Vitest（Node 环境）。

### 9.1 Fixture `test/fixtures/sample-skill/`

- `SKILL.md`：frontmatter `name: sample-skill`、`description: Sample skill for tests`、`version: 1.0.0`，正文含一级标题。
- `references/a.md`：含可搜索关键词（如 `alpha`、`DForm`）与多个段落。
- `references/nested/deep.md`：验证递归扫描与嵌套路径。
- `assets/binary.png`：写入含 `\0` 的假二进制字节，验证二进制判定。
- 测试内动态创建超限文件、指向 root 外的 symlink（测试后清理）。

### 9.2 单元测试

- **loader**
  - frontmatter 正常解析（name/description/version/未知字段保留）。
  - 无 frontmatter → 默认 name = 目录名、description = ''。
  - 损坏 YAML → 不抛错、meta 为空。
  - 跳过 `.git` / `node_modules` / `dist`。
  - `.md` 标题提取正确。
  - 文件按 relPath 升序。
  - 二进制文件 `isText: false`。
  - 指向 root 外的 symlink 被跳过。
- **safety**
  - 拒绝绝对路径、`..`、含 `\0` 的输入。
  - 接受带 `./` 前缀的合法 relPath。
  - realpath 越界校验生效。
- **search**
  - 字面量搜索、大小写敏感/不敏感。
  - 正则搜索与非法正则报错。
  - `contextLines` 生成正确 snippet。
  - `maxResults` 截断且 `limited: true`。
  - `pathPrefix` 过滤。
  - 二进制与超限文件被跳过并计数。
- **read-file**
  - 默认读取前 2000 行（fixture 文件小于 2000 行时即全文）。
  - `offset` / `limit` 切片、`returnedLines`、`truncated`、`totalLines` 正确（含 10 行文件读取第 5–9 行的边界用例）。
  - 超过 `MAX_READ_BYTES` 的文件可通过 `offset` / `limit` 分页读取，且在字节上限处按行截断。
  - 单行超限、不存在文件、二进制文件返回 `isError`。

### 9.3 集成测试

使用 `InMemoryTransport.createLinkedPair()` + `Client`：

1. 启动 server，连接 client。
2. `client.listTools()` 返回且仅包含 4 个工具：`get_skill_info`、`list_files`、`read_file`、`search_skill`。
3. `client.listResources()` 包含 `skill://SKILL.md` 与 `skill://references/a.md`，不包含 `skill://assets/binary.png`。
4. `client.callTool({ name: 'get_skill_info', arguments: {} })` 返回 sample-skill 元数据。
5. `client.callTool({ name: 'read_file', arguments: { path: 'SKILL.md' } })` 返回正文。
6. `client.callTool({ name: 'search_skill', arguments: { query: 'alpha' } })` 命中 `references/a.md`。
7. `client.readResource({ uri: 'skill://references/a.md' })` 返回文本内容。
8. `read_file` 传入 `../package.json` → `isError: true`。
9. flow 结束后关闭 server/client。

### 9.4 验收命令

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build       # tsup
```

## 10. 打包与发布

`package.json` 关键字段：

```json
{
  "name": "@frank17008/skills-mcp",
  "version": "0.1.0",
  "type": "module",
  "bin": { "skills-mcp": "dist/index.js" },
  "files": ["dist", "README.md"],
  "engines": { "node": ">=20" },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- `tsup.config.ts`：`entry: ['src/index.ts']`、`format: ['esm']`、`target: 'node20'`、`clean: true`、`banner: { js: '#!/usr/bin/env node' }`。
- `tsup` banner 注入 shebang；`src/index.ts` 不手写 shebang，避免产物出现重复 shebang。
- 依赖：`@modelcontextprotocol/sdk`、`gray-matter`、`zod`。
- 开发依赖：`typescript`、`tsup`、`tsx`、`vitest`、`@types/node`。
- 远程仓库：`https://github.com/Frank17008/skills-mcp.git`。实现完成后直接推送到 `origin main`；npm 发布仍由用户决定。

## 11. README 配置示例

安装/运行：

```bash
npx -y @frank17008/skills-mcp /path/to/skill
```

OpenCode（`opencode.json`）：

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

Claude Desktop：

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

Cursor（`.cursor/mcp.json`）结构同 Claude Desktop。

## 12. 验收标准

1. `node dist/index.js /home/Code/skills/pcloud-components-usage` 能正常启动，stdout 无日志污染。
2. `tools/list` 返回 4 个工具。
3. `resources/list` 包含 `skill://SKILL.md` 与 `skill://references/docs/*.md`（36 个组件文档）。
4. `get_skill_info` 返回 `pcloud-components-usage` 的 name/description/version/fileCount。
5. `list_files` 能列出组件文档；`search_skill` 能搜到指定组件 API；`read_file` 能读取 `references/docs/DForm.md`。
6. 越界路径（`../`、绝对路径）返回 `isError`。
7. 二进制文件读取返回 `isError`。
8. 无效 skill 目录（不存在 / 无 `SKILL.md`）启动时 exit 1 并输出明确错误。
9. `npm run typecheck && npm test && npm run build` 全部通过。
10. 代码提交并推送到 `origin main`（`https://github.com/Frank17008/skills-mcp.git`）。

## 13. 未来扩展（非本期）

- 多 skill 模式（一个 server 服务整个 skills 根目录）。
- Streamable HTTP transport。
- MCP Prompts（把 `SKILL.md` 暴露为可选 prompt）。
- 文件监听与动态索引刷新。
- `search_skill` 支持 glob `include` 与语义检索。
- ESLint / 格式化配置（含 `no-console` 规则）。
- 发布到 npm 并补充 CI 工作流。
