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
