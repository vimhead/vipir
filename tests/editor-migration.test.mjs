import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getRetiredEditorPackage, removeRetiredEditorSources } from "../extensions/vipir/editor-migration.ts";
import { normalizeVipirState, cloneVipirState, vipirStatesEqual, readVipirState, writeVipirState } from "../extensions/vipir/state.ts";

test("legacy editor and individual feature choices survive normalization and cloning", () => {
  const state = normalizeVipirState({ disabled: ["pi-me", "vipir-palette", "vipir-input-source"], editorDisabledFeatures: ["jump-mode", "unknown"] });
  assert.deepEqual(state, { disabled: ["vipir-editor", "vipir-input-source", "vipir-jump", "vipir-palette"] });
  const clone = cloneVipirState(state);
  clone.disabled.pop();
  assert.equal(state.disabled.length, 4);
  assert.equal(vipirStatesEqual(state, clone), false);
  assert.deepEqual(normalizeVipirState(state), state);
});

test("retired package identity is limited to the three merged repositories", () => {
  for (const name of ["pi-me", "pi-me-core", "pi-me-fields"]) {
    for (const source of [`git:github.com/vimhead/${name}`, `https://github.com/vimhead/${name}.git`, `git:github.com/vimhead/${name}@main`]) assert.equal(getRetiredEditorPackage(source)?.id, name);
  }
  for (const source of ["git:github.com/vimhead/vipir-jump", "git:github.com/vimhead/vipir-palette", "git:github.com/vimhead/vipir-input-source", "git:github.com/another/pi-me", "git:github.com/vimhead/pi-me-other", "git:github.com/vimhead/vipir-editor", "/work/pi-me", "npm:@vimhead.dev/pi-norn@tip"]) assert.equal(getRetiredEditorPackage(source), undefined);
});

test("replacement removes declarations in their own scopes, not repository files", () => {
  const removed = [];
  const packageManager = {
    listConfiguredPackages: () => [
      { source: "git:github.com/vimhead/pi-me", scope: "user" },
      { source: "git:github.com/vimhead/pi-me-fields@main", scope: "project" },
      { source: "git:github.com/vimhead/vipir-palette", scope: "user" },
      { source: "git:github.com/vimhead/vipir-editor", scope: "user" },
    ],
    removeSourceFromSettings: (source, options) => { removed.push({ source, ...options }); return true; },
  };
  const blocked = removeRetiredEditorSources({ packageManager, canReplaceEditor: false, onProgress: undefined });
  assert.deepEqual(blocked, { removed: [], errors: [] });
  assert.equal(removed.length, 0);
  const result = removeRetiredEditorSources({ packageManager, canReplaceEditor: true, onProgress: undefined });
  assert.equal(result.removed.length, 2);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(removed.map(item => item.local), [false, true]);
});

test("a migration failure reports the affected source and continues other removals", () => {
  const result = removeRetiredEditorSources({
    canReplaceEditor: true, onProgress: undefined,
    packageManager: {
      listConfiguredPackages: () => ["pi-me", "pi-me-fields"].map(name => ({ source: `git:github.com/vimhead/${name}`, scope: "user" })),
      removeSourceFromSettings(source) { if (source.endsWith("/pi-me")) throw new Error("read-only settings"); return true; },
    },
  });
  assert.equal(result.removed.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].extension.id, "pi-me");
});

test("bundled feature settings migrate once and never override later plugin toggles", async context => {
  const directory = await mkdtemp(join(tmpdir(), "vipir-plugin-state-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "vipir.json"), JSON.stringify({ disabled: ["vipir-editor"], editorDisabledFeatures: ["jump-mode"] }));
  await writeFile(join(directory, "vipi-editor.json"), JSON.stringify({ disabled: ["input-source"] }));
  const migrated = await readVipirState(directory);
  assert.deepEqual(migrated, { disabled: ["vipir-editor", "vipir-input-source"], editorPluginsMigrated: true });
  await writeVipirState({ disabled: [] }, directory);
  assert.deepEqual(await readVipirState(directory), { disabled: [], editorPluginsMigrated: true });
});
