import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getRetiredEditorPackage, removeRetiredEditorSources } from "../extensions/vipi/editor-migration.ts";
import { normalizeVipiState, cloneVipiState, vipiStatesEqual, readVipiState, writeVipiState } from "../extensions/vipi/state.ts";

test("legacy editor and individual feature choices survive normalization and cloning", () => {
  const state = normalizeVipiState({ disabled: ["pi-me", "pi-me-command-palette", "pi-me-input-source"], editorDisabledFeatures: ["jump-mode", "unknown"] });
  assert.deepEqual(state, { disabled: ["pi-me-command-palette", "pi-me-input-source", "pi-me-jump-mode", "vipi-editor"] });
  const clone = cloneVipiState(state);
  clone.disabled.pop();
  assert.equal(state.disabled.length, 4);
  assert.equal(vipiStatesEqual(state, clone), false);
  assert.deepEqual(normalizeVipiState(state), state);
});

test("retired package identity is limited to the three merged repositories", () => {
  for (const name of ["pi-me", "pi-me-core", "pi-me-fields"]) {
    for (const source of [`git:github.com/vimhead/${name}`, `https://github.com/vimhead/${name}.git`, `git:github.com/vimhead/${name}@main`]) assert.equal(getRetiredEditorPackage(source)?.id, name);
  }
  for (const source of ["git:github.com/vimhead/pi-me-jump-mode", "git:github.com/vimhead/pi-me-command-palette", "git:github.com/vimhead/pi-me-input-source", "git:github.com/another/pi-me", "git:github.com/vimhead/pi-me-other", "git:github.com/vimhead/vipi-editor", "/work/pi-me", "npm:@vimhead.dev/pi-norn@tip"]) assert.equal(getRetiredEditorPackage(source), undefined);
});

test("replacement removes declarations in their own scopes, not repository files", () => {
  const removed = [];
  const packageManager = {
    listConfiguredPackages: () => [
      { source: "git:github.com/vimhead/pi-me", scope: "user" },
      { source: "git:github.com/vimhead/pi-me-fields@main", scope: "project" },
      { source: "git:github.com/vimhead/pi-me-command-palette", scope: "user" },
      { source: "git:github.com/vimhead/vipi-editor", scope: "user" },
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
  const directory = await mkdtemp(join(tmpdir(), "vipi-plugin-state-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "vipi.json"), JSON.stringify({ disabled: ["vipi-editor"], editorDisabledFeatures: ["jump-mode"] }));
  await writeFile(join(directory, "vipi-editor.json"), JSON.stringify({ disabled: ["input-source"] }));
  const migrated = await readVipiState(directory);
  assert.deepEqual(migrated, { disabled: ["pi-me-input-source", "vipi-editor"], editorPluginsMigrated: true });
  await writeVipiState({ disabled: [] }, directory);
  assert.deepEqual(await readVipiState(directory), { disabled: [], editorPluginsMigrated: true });
});
