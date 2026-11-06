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
