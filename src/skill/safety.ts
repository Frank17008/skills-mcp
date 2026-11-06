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
