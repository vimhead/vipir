import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { vipirExtensions } from "../extensions/vipir/catalog.ts";
import { getDesiredEnabledIds, getVipirExtensionStatuses } from "../extensions/vipir/manager.ts";
import { cloneVipirState, normalizeVipirState, readVipirState, writeVipirState, vipirStatesEqual } from "../extensions/vipir/state.ts";

test("all catalog entries are enabled by default and use portable sources", () => {
  assert.deepEqual([...getDesiredEnabledIds({ disabled: [] })], vipirExtensions.map(({ id }) => id));
  assert.ok(vipirExtensions.every(({ source }) => source.startsWith("git:github.com/vimhead/") || source.startsWith("npm:")));
  assert.ok(vipirExtensions.every((entry) => !("tier" in entry)));
});

test("pi-norn uses the npm adapter and recognizes an existing installation", () => {
  const adapter = vipirExtensions.find(({ id }) => id === "norn");
  assert.equal(adapter.name, "pi-norn");
  assert.equal(adapter.source, "npm:@vimhead.dev/pi-norn@tip");
  assert.ok(!vipirExtensions.some(({ source }) => source === "git:github.com/vimhead/norn"));
  const configured = new Set(["npm:@vimhead.dev/pi-norn@tip"]);
  const installed = getVipirExtensionStatuses({ disabled: [] }, configured);
  assert.equal(installed.find(({ extension }) => extension.id === "norn").state, "installed");
  const disabled = normalizeVipirState({ disabled: ["norn"] });
  assert.deepEqual(disabled, { disabled: ["norn"] });
  assert.equal(getVipirExtensionStatuses(disabled, configured).find(({ extension }) => extension.id === "norn").state, "pending-remove");
});

test("editor and plugins have separate catalog entries with an editor dependency", () => {
  const enabled = getDesiredEnabledIds({ disabled: ["vipir-editor"] });
  assert.equal(enabled.has("vipir-editor"), false);
  for (const id of ["vipir-jump", "vipir-palette", "vipir-input-source"]) {
    assert.ok(vipirExtensions.some(entry => entry.id === id));
    assert.equal(enabled.has(id), false);
  }
  assert.equal(enabled.has("vipir-web-access"), true);
});

test("each entry can be disabled independently", () => {
  for (const { id } of vipirExtensions) assert.equal(getDesiredEnabledIds({ disabled: [id] }).has(id), false);
});

test("normalization removes duplicates and unknown IDs and migrates the theme ID", () => {
  assert.deepEqual(normalizeVipirState({ disabled: ["vipir-editor", 2, "unknown", "vipir-editor", "pi-yappi-themes"] }),
    { disabled: ["vipir-editor", "vipir-themes"] });
  assert.deepEqual(normalizeVipirState({ disabledPrimary: ["vipir-web-access"], enabledExtra: [] }), { disabled: ["vipir-web-access"] });
});

test("clones are independent and equality ignores order", () => {
  const state = { disabled: ["vipir-editor", "vipir-web-access"] };
  cloneVipirState(state).disabled.pop();
  assert.equal(state.disabled.length, 2);
  assert.equal(vipirStatesEqual(state, { disabled: ["vipir-web-access", "vipir-editor"] }), true);
});

test("statuses reflect install and removal intent", () => {
  const statuses = getVipirExtensionStatuses({ disabled: ["vipir-editor"] }, new Set(["git:github.com/vimhead/vipir-editor"]));
  assert.equal(statuses.find(({ extension }) => extension.id === "vipir-editor").state, "pending-remove");
  assert.equal(statuses.find(({ extension }) => extension.id === "vipir-web-access").state, "pending-install");
});

test("state reads are side-effect free; Vipir wins over legacy state after saving", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vipir-state-"));
  try {
    assert.deepEqual(await readVipirState(directory), { disabled: [] });
    const legacy = JSON.stringify({ disabledPrimary: ["pi-yappi-themes"], enabledExtra: [] });
    await writeFile(join(directory, "yappi.json"), legacy);
    assert.deepEqual(await readVipirState(directory), { disabled: ["vipir-themes"] });
    await assert.rejects(readFile(join(directory, "vipir.json")), { code: "ENOENT" });
    await writeVipirState({ disabled: ["vipir-editor"] }, directory);
    assert.deepEqual(await readVipirState(directory), { disabled: ["vipir-editor"], editorPluginsMigrated: true });
    assert.equal(await readFile(join(directory, "yappi.json"), "utf8"), legacy);
    await writeFile(join(directory, "vipir.json"), "{");
    await assert.rejects(readVipirState(directory), /Failed to read.*vipir.json/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
