import dotenv from 'dotenv';
dotenv.config();

export type LLMProfile = 'SMALL_MODEL' | 'LARGE_MODEL';

export interface AppConfig {
  ENABLE_TOOLS_LAYERING: boolean;
  ENABLE_SELF_IMPROVEMENT: boolean;
  LLM_PROFILE: LLMProfile;
  DISABLED_TOOLS: string[];
}

const llmProfileEnv = (process.env.LLM_PROFILE || 'LARGE_MODEL').toUpperCase();
const llmProfile: LLMProfile = llmProfileEnv === 'SMALL_MODEL' ? 'SMALL_MODEL' : 'LARGE_MODEL';

// Self-improvement is off by default for small models to avoid dangerous code generation
const defaultSelfImprovement = llmProfile === 'LARGE_MODEL';
// Tools layering is on by default for large models to save context/attention
const defaultToolsLayering = llmProfile === 'LARGE_MODEL';

import fs from 'fs';
import path from 'path';

const disabledToolsString = process.env.DISABLED_TOOLS || '';
const initialDisabledTools = disabledToolsString
  .split(',')
  .map(t => t.trim())
  .filter(t => t.length > 0);

// Global environment-level immutable copy to track locks
export const IMMUTABLE_DISABLED_TOOLS: string[] = [...initialDisabledTools];

// Load persisted user-toggled disabled tools if the file exists
let persistedDisabledTools: string[] = [...initialDisabledTools];
const stateFilePath = path.join(process.cwd(), 'disabled_tools.json');
try {
  if (fs.existsSync(stateFilePath)) {
    const fileData = fs.readFileSync(stateFilePath, 'utf8');
    const parsed = JSON.parse(fileData);
    if (Array.isArray(parsed)) {
      persistedDisabledTools = parsed;
    }
  }
} catch (e) {
  console.warn('[CONFIG] Failed to load persisted tool state:', e);
}

export const config: AppConfig = {
  LLM_PROFILE: llmProfile,
  ENABLE_TOOLS_LAYERING: process.env.ENABLE_TOOLS_LAYERING !== undefined 
    ? process.env.ENABLE_TOOLS_LAYERING === 'true' 
    : defaultToolsLayering,
  ENABLE_SELF_IMPROVEMENT: process.env.ENABLE_SELF_IMPROVEMENT !== undefined 
    ? process.env.ENABLE_SELF_IMPROVEMENT === 'true' 
    : defaultSelfImprovement,
  DISABLED_TOOLS: persistedDisabledTools,
};

export function saveConfigState() {
  try {
    fs.writeFileSync(stateFilePath, JSON.stringify(config.DISABLED_TOOLS), 'utf8');
  } catch (e) {
    console.error('[CONFIG] Failed to save tool state to disk:', e);
  }
}

console.log('[CONFIG] Master Switchboard Settings Initialized:', {
  LLM_PROFILE: config.LLM_PROFILE,
  ENABLE_TOOLS_LAYERING: config.ENABLE_TOOLS_LAYERING,
  ENABLE_SELF_IMPROVEMENT: config.ENABLE_SELF_IMPROVEMENT,
  DISABLED_TOOLS: config.DISABLED_TOOLS
});
