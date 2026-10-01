import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { normalizeVipirState, readVipirState, writeVipirState } from "../extensions/vipir/state.ts";

test("all Vipi disabled IDs migrate to Vipir without enabling plugins or Norn", () => {
  const state = normalizeVipirState({ disabled: ["pi-background-jobs", "pi-web-access", "pi-vipi-themes", "vipi-editor", "pi-me-jump-mode", "pi-me-command-palette", "pi-me-input-source", "norn", "__proto__"], editorPluginsMigrated: true });
  assert.deepEqual(state, { disabled: ["vipir-background-jobs", "vipir-web-access", "vipir-themes", "vipir-editor", "vipir-jump-mode", "vipir-command-palette", "vipir-input-source", "norn"].sort(), editorPluginsMigrated: true });
});

test("Vipir reads Vipi before Yappi, preserves legacy files, and does not hide corrupt state", async context => {
  const directory = await mkdtemp(join(tmpdir(), "vipir-rename-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "yappi.json"), '{"disabled":["norn"]}');
  const legacy = '{"disabled":["pi-me-jump-mode"],"editorPluginsMigrated":true}';
  await writeFile(join(directory, "vipi.json"), legacy);
  assert.deepEqual(await readVipirState(directory), { disabled: ["vipir-jump-mode"], editorPluginsMigrated: true });
  await assert.rejects(readFile(join(directory, "vipir.json")), { code: "ENOENT" });
  await writeVipirState({ disabled: ["vipir-command-palette"] }, directory);
  assert.deepEqual(await readVipirState(directory), { disabled: ["vipir-command-palette"], editorPluginsMigrated: true });
  assert.equal(await readFile(join(directory, "vipi.json"), "utf8"), legacy);
  await rm(join(directory, "vipir.json"));
  await writeFile(join(directory, "vipi.json"), "{");
  await assert.rejects(readVipirState(directory), /Failed to read.*vipi.json/);
});
