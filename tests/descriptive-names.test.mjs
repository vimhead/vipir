import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { vipirExtensions } from "../extensions/vipir/catalog.ts";
import { renamePackageSetting } from "../extensions/vipir/package-migration.ts";
import { normalizeVipirState, readVipirState, writeVipirState } from "../extensions/vipir/state.ts";

test("catalog uses descriptive plugin names and sources", () => {
  for (const id of ["vipir-jump-mode", "vipir-command-palette"]) {
    const extension = vipirExtensions.find(entry => entry.id === id);
    assert.equal(extension.name, id);
    assert.equal(extension.source, `git:github.com/vimhead/${id}`);
  }
  assert.ok(!vipirExtensions.some(entry => ["vipir-jump", "vipir-palette"].includes(entry.id)));
});

test("short-name and original pi-me choices converge without re-enabling disabled plugins", () => {
  const state = normalizeVipirState({
    disabled: ["vipir-jump", "vipir-palette", "pi-me-jump-mode", "pi-me-command-palette"],
    editorPluginsMigrated: true,
  });
  assert.deepEqual(state, { disabled: ["vipir-command-palette", "vipir-jump-mode"], editorPluginsMigrated: true });
});

test("short-name declarations retain pinned refs, exclusions and resource filters", () => {
  for (const [oldName, newName] of [["vipir-jump", "vipir-jump-mode"], ["vipir-palette", "vipir-command-palette"]]) {
    const entry = { source: `git:github.com/vimhead/${oldName}@stable`, extensions: [`extensions/${oldName}/index.ts`, `-extensions/${oldName}/private.ts`], skills: [] };
    assert.deepEqual(renamePackageSetting(entry), { ...entry, source: `git:github.com/vimhead/${newName}@stable`, extensions: [`extensions/${newName}/index.ts`, `-extensions/${newName}/private.ts`] });
  }
});

test("existing vipir.json choices survive reading and saving with descriptive IDs", async context => {
  const directory = await mkdtemp(join(tmpdir(), "vipir-descriptive-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "vipir.json"), JSON.stringify({ disabled: ["vipir-jump", "vipir-palette"], editorPluginsMigrated: true }));
  const state = await readVipirState(directory);
  assert.deepEqual(state.disabled, ["vipir-command-palette", "vipir-jump-mode"]);
  await writeVipirState(state, directory);
  assert.deepEqual(await readVipirState(directory), state);
});
