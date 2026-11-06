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
