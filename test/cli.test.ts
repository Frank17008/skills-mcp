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
