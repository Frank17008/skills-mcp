# skills-mcp Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic stdio MCP server that exposes a single Markdown skill directory through four tools and file resources.

**Architecture:** At startup, scan one skill directory into a metadata-only index (`SKILL.md` frontmatter + relative file list). Register four MCP tools (`get_skill_info`, `list_files`, `read_file`, `search_skill`) and one `skill://` resource per text file. All content is read from disk on demand; stdout is reserved for JSON-RPC.

**Tech Stack:** Node.js >= 20, TypeScript (ESM), `@modelcontextprotocol/sdk` v1.32.x, `gray-matter`, `zod` v3, `tsup`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-11-06-skills-mcp-design.md`

---

## Global Constraints

- **Node 20 is required.** Every shell command must start with:
  ```bash
  export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
  ```
- All source imports must use explicit `.js` extensions (NodeNext ESM).
- **Never write logs to stdout.** Use `src/logger.ts` (writes to stderr). Only `--help` / `--version` may write to stdout.
- Do not use `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Commit after each task with the message shown in the task.
- Run `npm run typecheck` and the task's tests before every commit.

## File Structure

```
skills-mcp/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .gitignore
├── .nvmrc
├── README.md
├── src/
│   ├── index.ts                    # process entry: parse CLI, load skill, connect stdio
│   ├── cli.ts                      # testable argument parsing + usage text
│   ├── server.ts                   # createServer(index): register tools + resources
│   ├── logger.ts                   # stderr-only logger
│   ├── skill/
│   │   ├── types.ts
│   │   ├── safety.ts
│   │   ├── loader.ts
│   │   └── search.ts
│   ├── tools/
│   │   ├── helpers.ts
│   │   ├── get-skill-info.ts
│   │   ├── list-files.ts
│   │   ├── read-file.ts
│   │   └── search-skill.ts
│   └── resources/
│       └── register.ts
├── scripts/
│   └── acceptance.mjs              # real-skill stdio acceptance check
└── test/
    ├── fixtures/sample-skill/
    │   ├── SKILL.md
    │   ├── references/a.md
    │   ├── references/nested/deep.md
    │   └── assets/binary.png
    ├── logger.test.ts
    ├── safety.test.ts
    ├── loader.test.ts
    ├── search.test.ts
    ├── tools-basic.test.ts
    ├── read-file.test.ts
    ├── resources.test.ts
    ├── cli.test.ts
    └── server.integration.test.ts
```

---

### Task 1: Scaffold project and stderr logger

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `src/logger.ts`
- Test: `test/logger.test.ts`

- [ ] **Step 1: Create configuration files**

`package.json`:
```json
{
  "name": "@frank17008/skills-mcp",
  "version": "0.1.0",
  "description": "Generic MCP server that exposes a Markdown skill directory via tools and resources",
  "type": "module",
  "bin": {
    "skills-mcp": "dist/index.js"
  },
  "files": [
    "dist",
    "README.md"
  ],
  "engines": {
    "node": ">=20"
  },
  "publishConfig": {
    "access": "public"
  },
  "license": "MIT",
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.32.2",
    "gray-matter": "^4.0.3",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^20.17.0",
    "tsup": "^8.3.5",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

`tsup.config.ts`:
```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

`.gitignore`:
```
node_modules/
dist/
coverage/
*.log
.DS_Store
```

`.nvmrc`:
```
20
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm install
```
Expected: `package-lock.json` created, no errors.

- [ ] **Step 3: Write the failing logger test**

`test/logger.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../src/logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logger', () => {
  it('writes warnings to stderr with a prefix', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    logger.warn('hello');
    expect(spy).toHaveBeenCalledWith('[skills-mcp] warn: hello\n');
  });

  it('writes errors to stderr with a prefix', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    logger.error('boom');
    expect(spy).toHaveBeenCalledWith('[skills-mcp] error: boom\n');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/logger.test.ts
```
Expected: FAIL because `../src/logger.js` cannot be resolved.

- [ ] **Step 5: Implement the logger**

`src/logger.ts`:
```ts
const PREFIX = '[skills-mcp]';

type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string): void {
  process.stderr.write(`${PREFIX} ${level}: ${message}\n`);
}

export const logger = {
  info: (message: string): void => write('info', message),
  warn: (message: string): void => write('warn', message),
  error: (message: string): void => write('error', message),
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/logger.test.ts
```
Expected: PASS.

- [ ] **Step 7: Typecheck and commit**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm run typecheck
git add package.json package-lock.json tsconfig.json tsup.config.ts vitest.config.ts .gitignore .nvmrc src/logger.ts test/logger.test.ts
git commit -m "chore: scaffold skills-mcp with Node 20 and stderr logger"
```

---

### Task 2: Skill types and safety utilities

**Files:**
- Create: `src/skill/types.ts`
- Create: `src/skill/safety.ts`
- Test: `test/safety.test.ts`

- [ ] **Step 1: Write the failing safety tests**

`test/safety.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  matchesPrefix,
  normalizePrefix,
  normalizeRelPath,
} from '../src/skill/safety.js';

describe('normalizeRelPath', () => {
  it('normalizes ./ and backslashes', () => {
    expect(normalizeRelPath('./references\\a.md')).toBe('references/a.md');
  });

  it('rejects absolute paths', () => {
    expect(() => normalizeRelPath('/etc/passwd')).toThrow(/outside skill directory/);
  });

  it('rejects traversal', () => {
    expect(() => normalizeRelPath('../package.json')).toThrow(/outside skill directory/);
    expect(() => normalizeRelPath('..')).toThrow(/outside skill directory/);
  });

  it('rejects NUL bytes', () => {
    expect(() => normalizeRelPath('a\0b')).toThrow(/NUL/);
  });
});

describe('normalizePrefix and matchesPrefix', () => {
  it('trims trailing slashes', () => {
    expect(normalizePrefix('references/docs/')).toBe('references/docs');
  });

  it('matches path segments only', () => {
    expect(matchesPrefix('references/docs/a.md', 'references/docs')).toBe(true);
    expect(matchesPrefix('references/docs/a.md', 'references/doc')).toBe(false);
    expect(matchesPrefix('references/docs/a.md', '')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/safety.test.ts
```
Expected: FAIL because `../src/skill/safety.js` cannot be resolved.

- [ ] **Step 3: Create the types**

`src/skill/types.ts`:
```ts
export interface SkillMeta {
  name: string;
  description: string;
  version?: string;
  lastUpdated?: string;
  [key: string]: unknown;
}

export interface SkillFileEntry {
  relPath: string;
  absPath: string;
  size: number;
  mimeType: string;
  title?: string;
  isText: boolean;
}

export interface SkillIndex {
  root: string;
  skillFilePath: string;
  meta: SkillMeta;
  files: SkillFileEntry[];
}
```

- [ ] **Step 4: Implement the safety utilities**

`src/skill/safety.ts`:
```ts
import path from 'node:path';
import fs from 'node:fs';
import { logger } from '../logger.js';

const DEFAULT_MAX_READ_BYTES = 1024 * 1024;

export const SKIP_NAMES = new Set(['.git', 'node_modules', 'dist', '.DS_Store']);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp',
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp4', '.mp3', '.wav', '.webm',
  '.wasm', '.exe', '.dll', '.so', '.dylib', '.bin',
]);

const MIME_TYPES: Record<string, string> = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.toml': 'application/toml',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.less': 'text/css',
  '.scss': 'text/css',
  '.csv': 'text/csv',
  '.sh': 'text/x-sh',
  '.bash': 'text/x-sh',
};

export function getMaxReadBytes(): number {
  const raw = process.env.SKILL_MCP_MAX_READ_BYTES;
  if (!raw) return DEFAULT_MAX_READ_BYTES;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    logger.warn(`Invalid SKILL_MCP_MAX_READ_BYTES="${raw}", using default ${DEFAULT_MAX_READ_BYTES}`);
    return DEFAULT_MAX_READ_BYTES;
  }
  return parsed;
}

export function normalizeRelPath(input: string): string {
  if (input.includes('\0')) {
    throw new Error('Invalid path: contains NUL byte');
  }
  if (path.isAbsolute(input)) {
    throw new Error(`Path outside skill directory is not allowed: ${input}`);
  }

  const normalized = path.posix.normalize(input.replace(/\\/g, '/'));
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Path outside skill directory is not allowed: ${input}`);
  }
  return normalized === '.' ? '' : normalized;
}

export function normalizePrefix(input: string | undefined): string {
  if (!input) return '';

  let normalized = normalizeRelPath(input);
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function matchesPrefix(relPath: string, prefix: string): boolean {
  if (!prefix) return true;
  return relPath === prefix || relPath.startsWith(`${prefix}/`);
}

export function isBinaryExtension(relPath: string): boolean {
  return BINARY_EXTENSIONS.has(path.posix.extname(relPath).toLowerCase());
}

export function mimeTypeFor(relPath: string): string {
  return MIME_TYPES[path.posix.extname(relPath).toLowerCase()] ?? 'text/plain';
}

export async function looksLikeText(absPath: string): Promise<boolean> {
  const handle = await fs.promises.open(absPath, 'r');
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return !buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

export async function assertRealPathWithinRoot(root: string, absPath: string): Promise<void> {
  const realRoot = await fs.promises.realpath(root);
  const realAbs = await fs.promises.realpath(absPath);
  if (realAbs !== realRoot && !realAbs.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`Path outside skill directory is not allowed: ${absPath}`);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/safety.test.ts
```
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm run typecheck
git add src/skill/types.ts src/skill/safety.ts test/safety.test.ts
git commit -m "feat: add skill types and path safety utilities"
```

---

### Task 3: Skill loader with frontmatter and file scan

**Files:**
- Create: `src/skill/loader.ts`
- Create: `test/fixtures/sample-skill/SKILL.md`
- Create: `test/fixtures/sample-skill/references/a.md`
- Create: `test/fixtures/sample-skill/references/nested/deep.md`
- Create: `test/fixtures/sample-skill/assets/binary.png`
- Test: `test/loader.test.ts`

- [ ] **Step 1: Create the fixture skill**

`test/fixtures/sample-skill/SKILL.md`:
```markdown
---
name: sample-skill
description: Sample skill for tests
version: 1.0.0
lastUpdated: '2026-11-06'
author: test
---

# Sample Skill

This is a sample skill used by the test suite.

Use `references/a.md` for more detail.
```

`test/fixtures/sample-skill/references/a.md`:
```markdown
# Reference A

alpha beta gamma

## DForm

The DForm component renders a form.

alpha appears twice: alpha.
```

`test/fixtures/sample-skill/references/nested/deep.md`:
```markdown
# Deep Reference

nested content with keyword delta.
```

Create the fake binary:
```bash
mkdir -p test/fixtures/sample-skill/assets
printf '\x89PNG\r\n\x1a\n\x00\x00\x00' > test/fixtures/sample-skill/assets/binary.png
```

- [ ] **Step 2: Write the failing loader tests**

`test/loader.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadSkill } from '../src/skill/loader.js';

const FIXTURE = path.resolve(process.cwd(), 'test/fixtures/sample-skill');
const tempDirs: string[] = [];

async function makeTempSkill(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-mcp-'));
  tempDirs.push(dir);
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = path.join(dir, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content);
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('loadSkill', () => {
  it('loads frontmatter, files, titles, and binary flags', async () => {
    const index = await loadSkill(FIXTURE);

    expect(index.meta.name).toBe('sample-skill');
    expect(index.meta.description).toBe('Sample skill for tests');
    expect(index.meta.version).toBe('1.0.0');
    expect(index.meta.lastUpdated).toBe('2026-11-06');
    expect(index.meta.author).toBe('test');

    const paths = index.files.map((file) => file.relPath);
    expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
    expect(paths).toContain('SKILL.md');
    expect(paths).toContain('references/a.md');
    expect(paths).toContain('references/nested/deep.md');
    expect(paths).toContain('assets/binary.png');

    const reference = index.files.find((file) => file.relPath === 'references/a.md');
    expect(reference?.title).toBe('Reference A');
    expect(reference?.mimeType).toBe('text/markdown');
    expect(reference?.isText).toBe(true);

    const binary = index.files.find((file) => file.relPath === 'assets/binary.png');
    expect(binary?.isText).toBe(false);
  });

  it('falls back to the directory name when frontmatter is missing', async () => {
    const dir = await makeTempSkill({ 'SKILL.md': '# Hello\n' });
    const index = await loadSkill(dir);
    expect(index.meta.name).toBe(path.basename(dir));
    expect(index.meta.description).toBe('');
  });

  it('does not crash on malformed frontmatter', async () => {
    const dir = await makeTempSkill({
      'SKILL.md': '---\nname: [\n---\n# Broken\n',
    });
    const index = await loadSkill(dir);
    expect(index.meta.name).toBe(path.basename(dir));
  });

  it('skips ignored directories', async () => {
    const dir = await makeTempSkill({
      'SKILL.md': '---\nname: skip-test\n---\n# Skip\n',
      '.git/config': 'ignored',
      'node_modules/pkg/index.js': 'ignored',
      'dist/out.js': 'ignored',
      'keep.md': '# Keep\n',
    });
    const index = await loadSkill(dir);
    const paths = index.files.map((file) => file.relPath);
    expect(paths).toContain('keep.md');
    expect(paths.some((p) => p.startsWith('.git/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('node_modules/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('dist/'))).toBe(false);
  });

  it('skips symlinks that escape the skill directory', async () => {
    const dir = await makeTempSkill({ 'SKILL.md': '# Link\n' });
    await fs.symlink('/etc/passwd', path.join(dir, 'escape.md'));
    const index = await loadSkill(dir);
    expect(index.files.map((file) => file.relPath)).not.toContain('escape.md');
  });

  it('rejects a missing skill directory', async () => {
    await expect(loadSkill(path.join(os.tmpdir(), 'skills-mcp-missing-does-not-exist'))).rejects.toThrow(
      /Skill directory not found/,
    );
  });

  it('rejects a directory without SKILL.md', async () => {
    const dir = await makeTempSkill({ 'other.md': '# Other\n' });
    await expect(loadSkill(dir)).rejects.toThrow(/SKILL\.md not found/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/loader.test.ts
```
Expected: FAIL because `../src/skill/loader.js` cannot be resolved.

- [ ] **Step 4: Implement the loader**

`src/skill/loader.ts`:
```ts
import path from 'node:path';
import fs from 'node:fs';
import matter from 'gray-matter';
import { logger } from '../logger.js';
import {
  SKIP_NAMES,
  isBinaryExtension,
  looksLikeText,
  mimeTypeFor,
} from './safety.js';
import type { SkillFileEntry, SkillIndex, SkillMeta } from './types.js';

function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function extractTitle(content: string): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) return match[1];
  }
  return undefined;
}

async function parseMeta(root: string, raw: string): Promise<SkillMeta> {
  const fallbackName = path.basename(root);
  try {
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const meta: SkillMeta = {
      ...data,
      name: typeof data.name === 'string' && data.name.length > 0 ? data.name : fallbackName,
      description: typeof data.description === 'string' ? data.description : '',
    };
    if (typeof data.version === 'string') meta.version = data.version;
    if (typeof data.lastUpdated === 'string') meta.lastUpdated = data.lastUpdated;
    return meta;
  } catch (error) {
    logger.warn(`Failed to parse SKILL.md frontmatter: ${(error as Error).message}`);
    return { name: fallbackName, description: '' };
  }
}

export async function loadSkill(rootInput: string): Promise<SkillIndex> {
  let root: string;
  try {
    root = await fs.promises.realpath(rootInput);
  } catch {
    throw new Error(`Skill directory not found: ${rootInput}`);
  }

  const rootStat = await fs.promises.stat(root);
  if (!rootStat.isDirectory()) {
    throw new Error(`Skill path is not a directory: ${rootInput}`);
  }

  const skillFilePath = path.join(root, 'SKILL.md');
  let skillRealPath: string;
  try {
    skillRealPath = await fs.promises.realpath(skillFilePath);
  } catch {
    throw new Error(`SKILL.md not found in skill directory: ${rootInput}`);
  }
  if (!isWithin(root, skillRealPath)) {
    throw new Error(`SKILL.md resolves outside skill directory: ${skillRealPath}`);
  }

  const skillStat = await fs.promises.stat(skillRealPath);
  if (!skillStat.isFile()) {
    throw new Error(`SKILL.md is not a file: ${skillFilePath}`);
  }

  const raw = await fs.promises.readFile(skillRealPath, 'utf8');
  const meta = await parseMeta(root, raw);

  const visitedDirs = new Set<string>([root]);
  const seenFiles = new Set<string>();
  const files: SkillFileEntry[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (SKIP_NAMES.has(entry.name)) continue;

      const absPath = path.join(dir, entry.name);
      const relPath = path.relative(root, absPath).split(path.sep).join('/');
      try {
        const realPath = await fs.promises.realpath(absPath);
        if (!isWithin(root, realPath)) {
          logger.warn(`Skipping symlink outside skill directory: ${relPath}`);
          continue;
        }

        const stat = await fs.promises.stat(realPath);
        if (stat.isDirectory()) {
          if (visitedDirs.has(realPath)) continue;
          visitedDirs.add(realPath);
          await walk(absPath);
          continue;
        }
        if (!stat.isFile()) continue;

        if (seenFiles.has(realPath)) {
          logger.warn(`Skipping duplicate file (same real path): ${relPath}`);
          continue;
        }
        seenFiles.add(realPath);

        const isText = isBinaryExtension(relPath)
          ? false
          : await looksLikeText(realPath).catch(() => false);

        let title: string | undefined;
        if (isText && /\.md$/i.test(relPath)) {
          const content = await fs.promises.readFile(realPath, 'utf8').catch(() => '');
          title = extractTitle(content);
        }

        files.push({
          relPath,
          absPath: realPath,
          size: stat.size,
          mimeType: mimeTypeFor(relPath),
          title,
          isText,
        });
      } catch (error) {
        logger.warn(`Skipping ${relPath}: ${(error as Error).message}`);
      }
    }
  }

  await walk(root);
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));

  return { root, skillFilePath, meta, files };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/loader.test.ts
```
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm run typecheck
git add src/skill/loader.ts test/fixtures test/loader.test.ts
git commit -m "feat: load skill frontmatter and file metadata"
```

---

### Task 4: Search implementation

**Files:**
- Create: `src/skill/search.ts`
- Test: `test/search.test.ts`

- [ ] **Step 1: Write the failing search tests**

`test/search.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadSkill } from '../src/skill/loader.js';
import { searchSkill } from '../src/skill/search.js';

const FIXTURE = path.resolve(process.cwd(), 'test/fixtures/sample-skill');

afterEach(() => {
  delete process.env.SKILL_MCP_MAX_READ_BYTES;
});

describe('searchSkill', () => {
  it('finds literal matches and reports one result per matching line', async () => {
    const index = await loadSkill(FIXTURE);
    const result = await searchSkill(index, { query: 'alpha', contextLines: 0 });

    expect(result.total).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({ path: 'references/a.md', line: 3, column: 1 });
    expect(result.results[1]).toMatchObject({ path: 'references/a.md', line: 9, column: 1 });
    expect(result.limited).toBe(false);
  });

  it('supports case-sensitive and regex searches', async () => {
    const index = await loadSkill(FIXTURE);

    const insensitive = await searchSkill(index, { query: 'DFORM' });
    expect(insensitive.total).toBe(2);

    const sensitive = await searchSkill(index, { query: 'DFORM', caseSensitive: true });
    expect(sensitive.total).toBe(0);

    const regex = await searchSkill(index, { query: 'D[A-Z]+', regex: true, caseSensitive: true });
    expect(regex.total).toBe(2);
  });

  it('rejects invalid regular expressions', async () => {
    const index = await loadSkill(FIXTURE);
    await expect(searchSkill(index, { query: '[', regex: true })).rejects.toThrow(/Invalid regular expression/);
  });

  it('supports context lines and result limits', async () => {
    const index = await loadSkill(FIXTURE);
    const result = await searchSkill(index, { query: 'alpha', contextLines: 2, maxResults: 1 });

    expect(result.results).toHaveLength(1);
    expect(result.limited).toBe(true);
    expect(result.results[0].snippet).toContain('Reference A');
    expect(result.results[0].snippet).toContain('alpha beta gamma');
  });

  it('filters by path prefix', async () => {
    const index = await loadSkill(FIXTURE);
    const result = await searchSkill(index, { query: 'nested', pathPrefix: 'references/nested' });

    expect(result.total).toBe(1);
    expect(result.results[0].path).toBe('references/nested/deep.md');
  });

  it('counts skipped binary files in scope', async () => {
    const index = await loadSkill(FIXTURE);
    const result = await searchSkill(index, { query: 'definitely-not-present' });

    expect(result.skippedBinary).toBeGreaterThanOrEqual(1);
  });

  it('skips text files larger than the read limit', async () => {
    process.env.SKILL_MCP_MAX_READ_BYTES = '5';
    const index = await loadSkill(FIXTURE);
    const result = await searchSkill(index, { query: 'alpha' });

    expect(result.total).toBe(0);
    expect(result.skippedLarge).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/search.test.ts
```
Expected: FAIL because `../src/skill/search.js` cannot be resolved.

- [ ] **Step 3: Implement search**

`src/skill/search.ts`:
```ts
import fs from 'node:fs';
import { getMaxReadBytes, matchesPrefix, normalizePrefix } from './safety.js';
import type { SkillIndex } from './types.js';

export interface SearchParams {
  query: string;
  regex?: boolean;
  caseSensitive?: boolean;
  maxResults?: number;
  contextLines?: number;
  pathPrefix?: string;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  snippet: string;
}

export interface SearchResult {
  query: string;
  total: number;
  limited: boolean;
  skippedBinary: number;
  skippedLarge: number;
  results: SearchMatch[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function searchSkill(index: SkillIndex, params: SearchParams): Promise<SearchResult> {
  const maxResults = params.maxResults ?? 50;
  const contextLines = params.contextLines ?? 2;
  const prefix = normalizePrefix(params.pathPrefix);
  const maxBytes = getMaxReadBytes();

  const source = params.regex ? params.query : escapeRegExp(params.query);
  let matcher: RegExp;
  try {
    matcher = new RegExp(source, params.caseSensitive ? '' : 'i');
  } catch (error) {
    throw new Error(`Invalid regular expression: ${(error as Error).message}`);
  }

  let skippedBinary = 0;
  let skippedLarge = 0;
  let total = 0;
  const results: SearchMatch[] = [];

  for (const file of index.files) {
    if (!matchesPrefix(file.relPath, prefix)) continue;

    if (!file.isText) {
      skippedBinary++;
      continue;
    }
    if (file.size > maxBytes) {
      skippedLarge++;
      continue;
    }

    let content: string;
    try {
      content = await fs.promises.readFile(file.absPath, 'utf8');
    } catch {
      skippedBinary++;
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let indexLine = 0; indexLine < lines.length; indexLine++) {
      const line = lines[indexLine];
      const match = matcher.exec(line);
      if (!match) continue;

      total++;
      if (results.length >= maxResults) continue;

      const start = Math.max(0, indexLine - contextLines);
      const end = Math.min(lines.length, indexLine + contextLines + 1);
      results.push({
        path: file.relPath,
        line: indexLine + 1,
        column: (match.index ?? 0) + 1,
        snippet: lines.slice(start, end).join('\n'),
      });
    }
  }

  return {
    query: params.query,
    total,
    limited: total > results.length,
    skippedBinary,
    skippedLarge,
    results,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/search.test.ts
```
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm run typecheck
git add src/skill/search.ts test/search.test.ts
git commit -m "feat: add literal and regex skill search"
```

---

### Task 5: Tool helpers, skill info, and file listing

**Files:**
- Create: `src/tools/helpers.ts`
- Create: `src/tools/get-skill-info.ts`
- Create: `src/tools/list-files.ts`
- Test: `test/tools-basic.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/tools-basic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadSkill } from '../src/skill/loader.js';
import { getSkillInfoPayload } from '../src/tools/get-skill-info.js';
import { listFilesPayload } from '../src/tools/list-files.js';

const FIXTURE = path.resolve(process.cwd(), 'test/fixtures/sample-skill');

describe('getSkillInfoPayload', () => {
  it('returns metadata and the full tree', async () => {
    const index = await loadSkill(FIXTURE);
    const payload = getSkillInfoPayload(index);

    expect(payload.name).toBe('sample-skill');
    expect(payload.fileCount).toBe(index.files.length);
    expect(payload.textFileCount).toBe(index.files.filter((file) => file.isText).length);
    expect(payload.tree).toContain('references/a.md');
  });
});

describe('listFilesPayload', () => {
  it('lists all files when no directory is given', async () => {
    const index = await loadSkill(FIXTURE);
    const payload = listFilesPayload(index);

    expect(payload.count).toBe(index.files.length);
    expect(payload.files.map((file) => file.path)).toContain('SKILL.md');
  });

  it('filters by path-segment prefix', async () => {
    const index = await loadSkill(FIXTURE);
    const payload = listFilesPayload(index, 'references/nested');

    expect(payload.count).toBe(1);
    expect(payload.files[0].path).toBe('references/nested/deep.md');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/tools-basic.test.ts
```
Expected: FAIL because the tool modules do not exist.

- [ ] **Step 3: Implement helpers, skill info, and file listing**

`src/tools/helpers.ts`:
```ts
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

export function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

`src/tools/get-skill-info.ts`:
```ts
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
```

`src/tools/list-files.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/tools-basic.test.ts
```
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm run typecheck
git add src/tools/helpers.ts src/tools/get-skill-info.ts src/tools/list-files.ts test/tools-basic.test.ts
git commit -m "feat: add skill info and file listing tools"
```

---

### Task 6: Paginated file reading

**Files:**
- Create: `src/tools/read-file.ts`
- Test: `test/read-file.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/read-file.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFileWindow } from '../src/tools/read-file.js';

const tempFiles: string[] = [];

async function makeFile(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-mcp-read-'));
  const file = path.join(dir, 'file.txt');
  await fs.writeFile(file, content);
  tempFiles.push(dir);
  return file;
}

afterEach(async () => {
  await Promise.all(tempFiles.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('readFileWindow', () => {
  it('reads the full short file by default', async () => {
    const file = await makeFile('one\ntwo\nthree\n');
    const result = await readFileWindow(file, 1, 2000, 1024 * 1024);

    expect(result.totalLines).toBe(3);
    expect(result.returnedLines).toBe(3);
    expect(result.content).toBe('one\ntwo\nthree');
    expect(result.truncated).toBe(false);
  });

  it('paginates with offset and limit', async () => {
    const file = await makeFile('1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n');
    const result = await readFileWindow(file, 5, 5, 1024 * 1024);

    expect(result.totalLines).toBe(10);
    expect(result.returnedLines).toBe(5);
    expect(result.content).toBe('5\n6\n7\n8\n9');
    expect(result.truncated).toBe(true);
  });

  it('does not mark a file truncated when the last line is returned', async () => {
    const file = await makeFile('1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n');
    const result = await readFileWindow(file, 5, 6, 1024 * 1024);

    expect(result.returnedLines).toBe(6);
    expect(result.truncated).toBe(false);
  });

  it('stops at the byte cap on a line boundary', async () => {
    const file = await makeFile('line1\nline2\nline3\n');
    const result = await readFileWindow(file, 1, 10, 5);

    expect(result.returnedLines).toBe(1);
    expect(result.content).toBe('line1');
    expect(result.truncated).toBe(true);
  });

  it('throws when a single line exceeds the byte cap', async () => {
    const file = await makeFile('0123456789\n');
    await expect(readFileWindow(file, 1, 10, 5)).rejects.toThrow(/Line too long/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/read-file.test.ts
```
Expected: FAIL because `../src/tools/read-file.js` cannot be resolved.

- [ ] **Step 3: Implement the read tool**

`src/tools/read-file.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/read-file.test.ts
```
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm run typecheck
git add src/tools/read-file.ts test/read-file.test.ts
git commit -m "feat: add paginated read_file tool"
```

---

### Task 7: Search tool registration

**Files:**
- Create: `src/tools/search-skill.ts`

- [ ] **Step 1: Implement the search tool**

`src/tools/search-skill.ts`:
```ts
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
```

- [ ] **Step 2: Typecheck**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
git add src/tools/search-skill.ts
git commit -m "feat: register search_skill tool"
```

---

### Task 8: Resource registration

**Files:**
- Create: `src/resources/register.ts`
- Test: `test/resources.test.ts`

- [ ] **Step 1: Write the failing resource URI tests**

`test/resources.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decodeResourceUri, resourceUri } from '../src/resources/register.js';

describe('resource URIs', () => {
  it('encodes path segments while keeping slashes', () => {
    expect(resourceUri('references/docs/DForm.md')).toBe('skill://references/docs/DForm.md');
    expect(resourceUri('references/my docs/a b.md')).toBe('skill://references/my%20docs/a%20b.md');
  });

  it('round-trips through URL parsing', () => {
    const uri = resourceUri('references/my docs/a b.md');
    expect(decodeResourceUri(new URL(uri))).toBe('references/my docs/a b.md');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/resources.test.ts
```
Expected: FAIL because `../src/resources/register.js` cannot be resolved.

- [ ] **Step 3: Implement resource registration**

`src/resources/register.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/resources.test.ts
```
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm run typecheck
git add src/resources/register.ts test/resources.test.ts
git commit -m "feat: expose text files as skill resources"
```

---

### Task 9: Server factory, CLI parsing, and process entry

**Files:**
- Create: `src/server.ts`
- Create: `src/cli.ts`
- Create: `src/index.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Write the failing CLI tests**

`test/cli.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCliArgs } from '../src/cli.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseCliArgs', () => {
  it('defaults to the provided cwd', () => {
    expect(parseCliArgs([], '/tmp/skill').skillDir).toBe('/tmp/skill');
  });

  it('uses the positional directory', () => {
    expect(parseCliArgs(['/a'], '/tmp').skillDir).toBe('/a');
  });

  it('prefers --skill and warns when both are provided', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(parseCliArgs(['--skill', '/a', '/b'], '/tmp').skillDir).toBe('/a');
    expect(spy).toHaveBeenCalled();
  });

  it('rejects multiple positionals', () => {
    expect(() => parseCliArgs(['/a', '/b'])).toThrow(/at most one/);
  });

  it('parses help and version flags', () => {
    expect(parseCliArgs(['--help']).help).toBe(true);
    expect(parseCliArgs(['-v']).version).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/cli.test.ts
```
Expected: FAIL because `../src/cli.js` cannot be resolved.

- [ ] **Step 3: Implement CLI parsing**

`src/cli.ts`:
```ts
import { parseArgs } from 'node:util';
import { logger } from './logger.js';

export interface CliOptions {
  skillDir: string;
  help: boolean;
  version: boolean;
}

export const USAGE = `Usage: skills-mcp [skillDir] [--skill <dir>] [--help] [--version]

Options:
  -s, --skill <dir>   Skill directory containing SKILL.md (default: current directory)
  -h, --help          Show this help
  -v, --version       Show version
`;

export function parseCliArgs(argv: string[], cwd = process.cwd()): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      skill: { type: 'string', short: 's' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (positionals.length > 1) {
    throw new Error(`Expected at most one skill directory, got ${positionals.length}`);
  }

  const positional = positionals[0];
  if (values.skill && positional && values.skill !== positional) {
    logger.warn(`Both --skill and positional directory provided; using --skill (${values.skill})`);
  }

  return {
    skillDir: values.skill ?? positional ?? cwd,
    help: Boolean(values.help),
    version: Boolean(values.version),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npx vitest run test/cli.test.ts
```
Expected: PASS.

- [ ] **Step 5: Implement the server factory**

`src/server.ts`:
```ts
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
```

- [ ] **Step 6: Implement the process entry**

`src/index.ts`:
```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseCliArgs, USAGE } from './cli.js';
import { loadSkill } from './skill/loader.js';
import { createServer, SERVER_VERSION } from './server.js';
import { logger } from './logger.js';

async function start(skillDir: string): Promise<void> {
  const index = await loadSkill(skillDir);
  const server = createServer(index);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(`Serving skill "${index.meta.name}" from ${index.root} (${index.files.length} files)`);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down`);
    await server.close();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (options.version) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }

  await start(options.skillDir);
}

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.stack ?? error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  logger.error(`Unhandled rejection: ${message}`);
  process.exit(1);
});

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

- [ ] **Step 7: Typecheck and commit**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm run typecheck
git add src/server.ts src/cli.ts src/index.ts test/cli.test.ts
git commit -m "feat: wire MCP server, CLI, and stdio entrypoint"
```

---

### Task 10: End-to-end integration tests

**Files:**
- Test: `test/server.integration.test.ts`

- [ ] **Step 1: Write the integration tests**

`test/server.integration.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { loadSkill } from '../src/skill/loader.js';
import { createServer } from '../src/server.js';

const FIXTURE = path.resolve(process.cwd(), 'test/fixtures/sample-skill');

let server: McpServer;
let client: Client;

function parseToolJson(result: CallToolResult): unknown {
  const first = result.content[0];
  if (!first || first.type !== 'text') {
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
    expect(result.content[0]).toMatchObject({ type: 'text' });
  });

  it('rejects binary file reads', async () => {
    const result = await client.callTool({
      name: 'read_file',
      arguments: { path: 'assets/binary.png' },
    });

    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run the full test suite**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm test
```
Expected: all test files PASS.

- [ ] **Step 3: Typecheck and commit**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm run typecheck
git add test/server.integration.test.ts
git commit -m "test: add end-to-end MCP integration coverage"
```

---

### Task 11: README, build, real-skill acceptance, and push

**Files:**
- Modify/Create: `README.md`
- Create: `scripts/acceptance.mjs`

- [ ] **Step 1: Write the README**

`README.md`:
```markdown
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
```

- [ ] **Step 2: Build the package**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm run build
```
Expected: `dist/index.js` exists and starts with `#!/usr/bin/env node`.

Verify:
```bash
head -1 dist/index.js
node dist/index.js --version
```
Expected: first line is `#!/usr/bin/env node`; version prints `0.1.0`.

- [ ] **Step 3: Run a real-skill acceptance check against pcloud-components-usage**

Create `scripts/acceptance.mjs`:
```js
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
```

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
node scripts/acceptance.mjs /home/Code/skills/pcloud-components-usage
```
Expected:
- `tools:` includes all four tools.
- `componentDocs:` is 36.
- `info:` shows `pcloud-components-usage`.
- `files:` lists the component documents.
- `search:` finds `references/docs/DForm.md`.
- `read:` returns the first lines of the DForm document.

- [ ] **Step 4: Final verification**

Run:
```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
npm run typecheck
npm test
npm run build
```
Expected: all commands exit 0.

- [ ] **Step 5: Commit and push**

```bash
export PATH="/root/.nvm/versions/node/v20.19.0/bin:$PATH"
git remote get-url origin >/dev/null 2>&1 || git remote add origin https://github.com/Frank17008/skills-mcp.git
git add README.md scripts/acceptance.mjs
git commit -m "docs: add usage, MCP client configuration, and acceptance script"
git push -u origin main
```

Expected: push succeeds to `https://github.com/Frank17008/skills-mcp.git`.

---

## Self-Review Checklist

- [ ] Every spec requirement in §6 (tools/resources) is implemented.
- [ ] Safety rules in §8 are enforced (path traversal, symlink escape, byte limits, stderr-only logging).
- [ ] All acceptance criteria in spec §12 are covered by tests or the Task 11 acceptance script.
- [ ] No TODOs, placeholders, or `as any` in source files.
- [ ] `npm run typecheck`, `npm test`, and `npm run build` pass on Node 20.
