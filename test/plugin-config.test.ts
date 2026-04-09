import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  globalConfigPath,
  loadPluginConfig,
  projectConfigPath,
  saveGlobalPluginConfig,
} from "../src/plugin-config.js";

describe("loadPluginConfig", () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-plugin-config-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeGlobalConfig(content: string) {
    const dir = join(tmpDir, ".pi", "agent");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "subagents.json"), content);
  }

  function writeProjectConfig(cwd: string, content: string) {
    const dir = join(cwd, ".pi");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "subagents.json"), content);
  }

  it("returns empty object when no config files exist", () => {
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg).toEqual({});
  });

  it("loads max_concurrent from global config", () => {
    writeGlobalConfig(JSON.stringify({ max_concurrent: 8 }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.max_concurrent).toBe(8);
  });

  it("loads max_turns from global config", () => {
    writeGlobalConfig(JSON.stringify({ max_turns: 50 }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.max_turns).toBe(50);
  });

  it("accepts max_turns: 0 (unlimited)", () => {
    writeGlobalConfig(JSON.stringify({ max_turns: 0 }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.max_turns).toBe(0);
  });

  it("loads grace_turns from global config", () => {
    writeGlobalConfig(JSON.stringify({ grace_turns: 3 }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.grace_turns).toBe(3);
  });

  it("loads join_mode from global config", () => {
    writeGlobalConfig(JSON.stringify({ join_mode: "async" }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.join_mode).toBe("async");
  });

  it("accepts all valid join_mode values", () => {
    for (const mode of ["smart", "async", "group"] as const) {
      writeGlobalConfig(JSON.stringify({ join_mode: mode }));
      expect(loadPluginConfig(tmpDir).join_mode).toBe(mode);
    }
  });

  it("ignores invalid join_mode", () => {
    writeGlobalConfig(JSON.stringify({ join_mode: "parallel" }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.join_mode).toBeUndefined();
  });

  it("ignores max_concurrent < 1", () => {
    writeGlobalConfig(JSON.stringify({ max_concurrent: 0 }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.max_concurrent).toBeUndefined();
  });

  it("ignores negative max_turns", () => {
    writeGlobalConfig(JSON.stringify({ max_turns: -1 }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.max_turns).toBeUndefined();
  });

  it("ignores grace_turns < 1", () => {
    writeGlobalConfig(JSON.stringify({ grace_turns: 0 }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.grace_turns).toBeUndefined();
  });

  it("project config overrides global config", () => {
    writeGlobalConfig(JSON.stringify({ max_concurrent: 4, grace_turns: 5 }));
    writeProjectConfig(tmpDir, JSON.stringify({ max_concurrent: 10 }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.max_concurrent).toBe(10); // project wins
    expect(cfg.grace_turns).toBe(5);     // global still applies
  });

  it("project config alone (no global) works", () => {
    writeProjectConfig(tmpDir, JSON.stringify({ max_concurrent: 2, join_mode: "group" }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.max_concurrent).toBe(2);
    expect(cfg.join_mode).toBe("group");
  });

  it("silently ignores malformed JSON", () => {
    writeGlobalConfig("not-valid-json{{{");
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg).toEqual({});
  });

  it("silently ignores non-object JSON (array)", () => {
    writeGlobalConfig("[1, 2, 3]");
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg).toEqual({});
  });

  it("silently ignores non-numeric values for numeric fields", () => {
    writeGlobalConfig(JSON.stringify({ max_concurrent: "four", grace_turns: true }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.max_concurrent).toBeUndefined();
    expect(cfg.grace_turns).toBeUndefined();
  });

  it("floors fractional values", () => {
    writeGlobalConfig(JSON.stringify({ max_concurrent: 3.9, grace_turns: 7.1 }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.max_concurrent).toBe(3);
    expect(cfg.grace_turns).toBe(7);
  });

  it("ignores unknown fields without error", () => {
    writeGlobalConfig(JSON.stringify({ max_concurrent: 5, unknown_field: "hello" }));
    const cfg = loadPluginConfig(tmpDir);
    expect(cfg.max_concurrent).toBe(5);
    expect((cfg as any).unknown_field).toBeUndefined();
  });
});

describe("globalConfigPath", () => {
  it("includes ~/.pi/agent/subagents.json", () => {
    const path = globalConfigPath();
    expect(path).toMatch(/\.pi[/\\]agent[/\\]subagents\.json$/);
  });
});

describe("projectConfigPath", () => {
  it("returns <cwd>/.pi/subagents.json", () => {
    const path = projectConfigPath("/some/project");
    expect(path).toBe(join("/some/project", ".pi", "subagents.json"));
  });
});

describe("saveGlobalPluginConfig", () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-plugin-config-save-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the config file with provided values", () => {
    saveGlobalPluginConfig({ max_concurrent: 6, join_mode: "async" });
    const raw = JSON.parse(readFileSync(globalConfigPath(), "utf-8"));
    expect(raw.max_concurrent).toBe(6);
    expect(raw.join_mode).toBe("async");
  });

  it("merges into an existing config file without overwriting unrelated fields", () => {
    const dir = join(tmpDir, ".pi", "agent");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "subagents.json"), JSON.stringify({ max_concurrent: 4, grace_turns: 5 }));

    saveGlobalPluginConfig({ max_concurrent: 8 });

    const raw = JSON.parse(readFileSync(globalConfigPath(), "utf-8"));
    expect(raw.max_concurrent).toBe(8);  // updated
    expect(raw.grace_turns).toBe(5);     // preserved
  });

  it("creates parent directories if they do not exist", () => {
    // HOME is an empty tmpDir — no .pi/agent/ yet
    saveGlobalPluginConfig({ grace_turns: 3 });
    const raw = JSON.parse(readFileSync(globalConfigPath(), "utf-8"));
    expect(raw.grace_turns).toBe(3);
  });
});
