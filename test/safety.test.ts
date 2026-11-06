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
