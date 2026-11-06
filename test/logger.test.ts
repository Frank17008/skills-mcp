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
