import { describe, expect, it } from 'vitest';
import { decodeResourceUri, resourceUri } from '../src/resources/register.js';

describe('resource URIs', () => {
  it('encodes path segments while keeping slashes', () => {
    expect(resourceUri('references/docs/DForm.md')).toBe('skill://references/docs/DForm.md');
    expect(resourceUri('references/my docs/a b.md')).toBe('skill://references/my%20docs/a%20b.md');
  });

  it('round-trips through URL parsing', () => {
    const uri = resourceUri('references/my docs/a b.md');
    expect(decodeResourceUri(new URL(uri))).toBe('references/my docs/a b.md');
  });
});
