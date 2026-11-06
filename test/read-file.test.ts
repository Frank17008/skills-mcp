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
