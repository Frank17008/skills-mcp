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
