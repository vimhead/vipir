import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { vipiExtensions } from "../extensions/vipi/catalog.ts";
import { getDesiredEnabledIds, getVipiExtensionStatuses } from "../extensions/vipi/manager.ts";
import { cloneVipiState, normalizeVipiState, readVipiState, writeVipiState, vipiStatesEqual } from "../extensions/vipi/state.ts";

test("all catalog entries are enabled by default and use portable sources", () => {
  assert.deepEqual([...getDesiredEnabledIds({ disabled: [] })], vipiExtensions.map(({ id }) => id));
  assert.ok(vipiExtensions.every(({ source }) => source.startsWith("git:github.com/vimhead/") || source.startsWith("npm:")));
  assert.ok(vipiExtensions.every((entry) => !("tier" in entry)));
});

test("pi-norn uses the npm adapter and recognizes an existing installation", () => {
  const adapter = vipiExtensions.find(({ id }) => id === "norn");
  assert.equal(adapter.name, "pi-norn");
  assert.equal(adapter.source, "npm:@vimhead.dev/pi-norn@tip");
  assert.ok(!vipiExtensions.some(({ source }) => source === "git:github.com/vimhead/norn"));
  const configured = new Set(["npm:@vimhead.dev/pi-norn@tip"]);
  const installed = getVipiExtensionStatuses({ disabled: [] }, configured);
  assert.equal(installed.find(({ extension }) => extension.id === "norn").state, "installed");
  const disabled = normalizeVipiState({ disabled: ["norn"] });
  assert.deepEqual(disabled, { disabled: ["norn"] });
  assert.equal(getVipiExtensionStatuses(disabled, configured).find(({ extension }) => extension.id === "norn").state, "pending-remove");
});

test("explicitly disabling pi-me also disables its dependents", () => {
  const enabled = getDesiredEnabledIds({ disabled: ["pi-me"] });
  for (const id of ["pi-me", "pi-me-jump-mode", "pi-me-command-palette", "pi-me-input-source"]) assert.equal(enabled.has(id), false);
  assert.equal(enabled.has("pi-web-access"), true);
});

test("each entry can be disabled independently", () => {
  for (const { id } of vipiExtensions) assert.equal(getDesiredEnabledIds({ disabled: [id] }).has(id), false);
});

test("normalization removes duplicates and unknown IDs and migrates the theme ID", () => {
  assert.deepEqual(normalizeVipiState({ disabled: ["pi-me", 2, "unknown", "pi-me", "pi-yappi-themes"] }),
    { disabled: ["pi-me", "pi-vipi-themes"] });
  assert.deepEqual(normalizeVipiState({ disabledPrimary: ["pi-web-access"], enabledExtra: [] }), { disabled: ["pi-web-access"] });
});

test("clones are independent and equality ignores order", () => {
  const state = { disabled: ["pi-me", "pi-web-access"] };
  cloneVipiState(state).disabled.pop();
  assert.equal(state.disabled.length, 2);
  assert.equal(vipiStatesEqual(state, { disabled: ["pi-web-access", "pi-me"] }), true);
});

test("statuses reflect install and removal intent", () => {
  const statuses = getVipiExtensionStatuses({ disabled: ["pi-me"] }, new Set(["git:github.com/vimhead/pi-me"]));
  assert.equal(statuses.find(({ extension }) => extension.id === "pi-me").state, "pending-remove");
  assert.equal(statuses.find(({ extension }) => extension.id === "pi-web-access").state, "pending-install");
});

test("state reads are side-effect free; Vipi wins over legacy state after saving", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vipi-state-"));
  try {
    assert.deepEqual(await readVipiState(directory), { disabled: [] });
    const legacy = JSON.stringify({ disabledPrimary: ["pi-yappi-themes"], enabledExtra: [] });
    await writeFile(join(directory, "yappi.json"), legacy);
    assert.deepEqual(await readVipiState(directory), { disabled: ["pi-vipi-themes"] });
    await assert.rejects(readFile(join(directory, "vipi.json")), { code: "ENOENT" });
    await writeVipiState({ disabled: ["pi-me"] }, directory);
    assert.deepEqual(await readVipiState(directory), { disabled: ["pi-me"] });
    assert.equal(await readFile(join(directory, "yappi.json"), "utf8"), legacy);
    await writeFile(join(directory, "vipi.json"), "{");
    await assert.rejects(readVipiState(directory), /Failed to read.*vipi.json/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
