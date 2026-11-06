export interface SkillMeta {
  name: string;
  description: string;
  version?: string;
  lastUpdated?: string;
  [key: string]: unknown;
}

export interface SkillFileEntry {
  relPath: string;
  absPath: string;
  size: number;
  mimeType: string;
  title?: string;
  isText: boolean;
}

export interface SkillIndex {
  root: string;
  skillFilePath: string;
  meta: SkillMeta;
  files: SkillFileEntry[];
}
