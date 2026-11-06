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
