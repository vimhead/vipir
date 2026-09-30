import assert from "node:assert/strict";
import test from "node:test";
import { getRetiredEditorPackage, removeRetiredEditorSources } from "../extensions/vipi/editor-migration.ts";
import { normalizeVipiState, cloneVipiState, vipiStatesEqual } from "../extensions/vipi/state.ts";

test("legacy editor and individual feature choices survive normalization and cloning", () => {
  const state = normalizeVipiState({ disabled: ["pi-me", "pi-me-command-palette", "pi-me-input-source"], editorDisabledFeatures: ["jump-mode", "unknown"] });
  assert.deepEqual(state, { disabled: ["vipi-editor"], editorDisabledFeatures: ["command-palette", "input-source", "jump-mode"] });
  const clone = cloneVipiState(state);
  clone.editorDisabledFeatures.pop();
  assert.equal(state.editorDisabledFeatures.length, 3);
  assert.equal(vipiStatesEqual(state, clone), false);
  assert.deepEqual(normalizeVipiState(state), state);
});

test("retired package identity is limited to the six owned repositories", () => {
  for (const name of ["pi-me", "pi-me-core", "pi-me-fields", "pi-me-jump-mode", "pi-me-command-palette", "pi-me-input-source"]) {
    for (const source of [`git:github.com/vimhead/${name}`, `https://github.com/vimhead/${name}.git`, `git:github.com/vimhead/${name}@main`]) assert.equal(getRetiredEditorPackage(source)?.id, name);
  }
  for (const source of ["git:github.com/another/pi-me", "git:github.com/vimhead/pi-me-other", "git:github.com/vimhead/vipi-editor", "/work/pi-me", "npm:@vimhead.dev/pi-norn@tip"]) assert.equal(getRetiredEditorPackage(source), undefined);
});

test("replacement removes declarations in their own scopes, not repository files", () => {
  const removed = [];
  const packageManager = {
    listConfiguredPackages: () => [
      { source: "git:github.com/vimhead/pi-me", scope: "user" },
      { source: "git:github.com/vimhead/pi-me-command-palette@main", scope: "project" },
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
      listConfiguredPackages: () => ["pi-me", "pi-me-jump-mode"].map(name => ({ source: `git:github.com/vimhead/${name}`, scope: "user" })),
      removeSourceFromSettings(source) { if (source.endsWith("/pi-me")) throw new Error("read-only settings"); return true; },
    },
  });
  assert.equal(result.removed.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].extension.id, "pi-me");
});
