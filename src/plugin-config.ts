/**
 * plugin-config.ts — Load and save plugin-level configuration from:
 *   ~/.pi/agent/subagents.json  (global, lower priority)
 *   <cwd>/.pi/subagents.json   (project, higher priority, overwrites global)
 *
 * Supported fields:
 *   max_concurrent  — max concurrent background agents (default: 4)
 *   max_turns       — default max agentic turns; 0 = unlimited (default: unlimited)
 *   grace_turns     — grace turns after wrap-up steer (default: 5)
 *   join_mode       — default join mode: "smart" | "async" | "group" (default: "smart")
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { JoinMode } from "./types.js";

export interface PluginConfig {
  /** Max concurrent background agents. Default: 4. */
  max_concurrent?: number;
  /** Default max agentic turns before wrap-up steer. 0 = unlimited. Default: unlimited. */
  max_turns?: number;
  /** Grace turns allowed after the wrap-up steer message. Default: 5. */
  grace_turns?: number;
  /** Default join mode for background agents. Default: "smart". */
  join_mode?: JoinMode;
}

/** Path to the global config file. */
export function globalConfigPath(): string {
  return join(homedir(), ".pi", "agent", "subagents.json");
}

/** Path to the project-level config file. */
export function projectConfigPath(cwd: string): string {
  return join(cwd, ".pi", "subagents.json");
}

function readJson(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const content = readFileSync(path, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Silently ignore unreadable or malformed files
  }
  return undefined;
}

function parseConfig(raw: Record<string, unknown>): PluginConfig {
  const cfg: PluginConfig = {};

  if (typeof raw.max_concurrent === "number" && raw.max_concurrent >= 1) {
    cfg.max_concurrent = Math.floor(raw.max_concurrent);
  }
  if (typeof raw.max_turns === "number" && raw.max_turns >= 0) {
    cfg.max_turns = Math.floor(raw.max_turns);
  }
  if (typeof raw.grace_turns === "number" && raw.grace_turns >= 1) {
    cfg.grace_turns = Math.floor(raw.grace_turns);
  }
  if (raw.join_mode === "smart" || raw.join_mode === "async" || raw.join_mode === "group") {
    cfg.join_mode = raw.join_mode;
  }

  return cfg;
}

/**
 * Load plugin configuration.
 * Project-level settings (`.pi/config.json`) override global ones (`~/.pi/agent/config.json`).
 * Unknown or invalid values are silently ignored — defaults remain in effect.
 */
export function loadPluginConfig(cwd: string): PluginConfig {
  const globalRaw = readJson(globalConfigPath());
  const projectRaw = readJson(projectConfigPath(cwd));

  const global = globalRaw ? parseConfig(globalRaw) : {};
  const project = projectRaw ? parseConfig(projectRaw) : {};

  // Project overrides global; both are sparse — only set fields win
  return { ...global, ...project };
}

/**
 * Persist settings to the global config file (`~/.pi/agent/config.json`).
 * Only the provided fields are written; other fields in the existing file are preserved.
 * Throws if the file cannot be written.
 */
export function saveGlobalPluginConfig(updates: PluginConfig): void {
  const path = globalConfigPath();
  const existing = readJson(path) ?? {};

  // Merge updates into existing raw object
  const merged: Record<string, unknown> = { ...existing };
  if (updates.max_concurrent !== undefined) merged.max_concurrent = updates.max_concurrent;
  if (updates.max_turns !== undefined) merged.max_turns = updates.max_turns;
  if (updates.grace_turns !== undefined) merged.grace_turns = updates.grace_turns;
  if (updates.join_mode !== undefined) merged.join_mode = updates.join_mode;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}
