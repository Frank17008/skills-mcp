import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

export function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
