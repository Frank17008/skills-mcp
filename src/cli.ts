import { parseArgs } from 'node:util';
import { logger } from './logger.js';

export interface CliOptions {
  skillDir: string;
  help: boolean;
  version: boolean;
}

export const USAGE = `Usage: skills-mcp [skillDir] [--skill <dir>] [--help] [--version]

Options:
  -s, --skill <dir>   Skill directory containing SKILL.md (default: current directory)
  -h, --help          Show this help
  -v, --version       Show version
`;

export function parseCliArgs(argv: string[], cwd = process.cwd()): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      skill: { type: 'string', short: 's' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (positionals.length > 1) {
    throw new Error(`Expected at most one skill directory, got ${positionals.length}`);
  }

  const positional = positionals[0];
  if (values.skill && positional && values.skill !== positional) {
    logger.warn(`Both --skill and positional directory provided; using --skill (${values.skill})`);
  }

  return {
    skillDir: values.skill ?? positional ?? cwd,
    help: Boolean(values.help),
    version: Boolean(values.version),
  };
}
