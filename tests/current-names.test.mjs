import assert from "node:assert/strict";
import test from "node:test";
import vipir from "../extensions/vipir/index.ts";
import { parseManagedSource } from "../extensions/vipir/package-names.ts";
import { normalizeVipirState } from "../extensions/vipir/state.ts";
import { vipirExtensions } from "../extensions/vipir/catalog.ts";

test("the manager registers only /vipir", () => {
  const commands = [];
  vipir({ registerCommand: name => commands.push(name), on: () => {} });
  assert.deepEqual(commands, ["vipir"]);
});

test("only current package names are recognized, including pinned current sources", () => {
  for (const { source } of vipirExtensions.filter(entry => entry.source.startsWith("git:"))) {
    assert.deepEqual(parseManagedSource(source + "@stable"), { canonicalSource: source });
  }
  for (const name of ["vipi", "vipi-editor", "pi-me", "pi-me-core", "pi-me-fields", "pi-me-jump-mode", "pi-me-command-palette", "pi-me-input-source", "pi-background-jobs", "pi-web-access", "pi-vipi-themes", "vipir-jump", "vipir-palette"]) {
    assert.equal(parseManagedSource("git:github.com/vimhead/" + name), undefined);
  }
});

test("old IDs, feature settings and migration markers do not create current disabled choices", () => {
  assert.deepEqual(normalizeVipirState({
    disabled: ["vipir-jump", "vipir-palette", "vipi-editor", "pi-me", "vipir-command-palette"],
    disabledPrimary: ["vipir-editor"],
    editorDisabledFeatures: ["jump-mode"],
    editorPluginsMigrated: true,
  }), { disabled: ["vipir-command-palette"] });
});
