import assert from "node:assert/strict";
import test from "node:test";
import { migrateRenamedPackages, renamePackageSetting } from "../extensions/vipir/package-migration.ts";
import { parseManagedSource, renamedPackages } from "../extensions/vipir/package-names.ts";

const source = name => `git:github.com/vimhead/${name}`;

function fixture(globalPackages, projectPackages = []) {
  const global = { packages: globalPackages, theme: "catppuccin-mocha" };
  const project = { packages: projectPackages, defaultModel: "unchanged" };
  const installs = [];
  return { global, project, installs, includeProject: true, isEnabled: () => true,
    packageManager: { async install(value, options) { installs.push([value, options]); } },
    settingsManager: {
      getGlobalSettings: () => global, getProjectSettings: () => project,
      setPackages: value => { global.packages = value; },
      setProjectPackages: value => { project.packages = value; },
    },
  };
}

test("all eight renamed sources retain Git refs; unrelated owners and Norn are untouched", () => {
  for (const [oldName, newName] of Object.entries(renamedPackages)) {
    assert.equal(renamePackageSetting(`git:https://github.com/vimhead/${oldName}.git@branch/name`), source(newName) + "@branch/name");
    assert.equal(parseManagedSource(source(newName) + "@main").canonicalSource, source(newName));
  }
  for (const value of [source("pi-me"), source("pi-me-core"), source("pi-me-fields"), source("norn"), "npm:@vimhead.dev/pi-norn@tip", "git:github.com/other/vipi", "../vipi", source("constructor")]) {
    assert.equal(renamePackageSetting(value), value);
  }
});

test("filtered package declarations keep their resource choices and update extension paths", () => {
  const original = { source: source("pi-me-command-palette"), extensions: ["extensions/pi-me-command-palette/index.ts", "-extensions/pi-me-command-palette/private.ts"], skills: [], themes: ["-dark*"] };
  assert.deepEqual(renamePackageSetting(original), { ...original, source: source("vipir-palette"), extensions: ["extensions/vipir-palette/index.ts", "-extensions/vipir-palette/private.ts"] });
  assert.equal(original.source, source("pi-me-command-palette"));
});

test("migration preserves scope and unrelated settings, and does not fetch disabled packages", async () => {
  const options = fixture([source("vipi"), source("pi-web-access")], [source("pi-me-jump-mode")]);
  options.isEnabled = id => id !== "vipir-web-access";
  const result = await migrateRenamedPackages(options);
  assert.deepEqual(result.errors, []);
  assert.equal(result.removed.length, 3);
  assert.deepEqual(options.global.packages, [source("vipir"), source("vipir-web-access")]);
  assert.deepEqual(options.project.packages, [source("vipir-jump")]);
  assert.deepEqual(options.installs, [[source("vipir"), { local: false }], [source("vipir-jump"), { local: true }]]);
  assert.equal(options.global.theme, "catppuccin-mocha");
  assert.equal(options.project.defaultModel, "unchanged");
  await migrateRenamedPackages(options);
  assert.equal(options.installs.length, 2);
});

test("explicit new declarations win over aliases without losing filters or pinned refs", async () => {
  const preferred = { source: source("vipir-editor") + "@stable", extensions: [] };
  const options = fixture([source("vipi-editor"), preferred]);
  await migrateRenamedPackages(options);
  assert.deepEqual(options.global.packages, [preferred]);
  assert.deepEqual(options.installs, [[preferred.source, { local: false }]]);
});

test("failed replacements retain the old declaration; other migrations can finish", async () => {
  const options = fixture([source("vipi-editor"), source("pi-vipi-themes")]);
  options.packageManager.install = async value => { if (value === source("vipir-editor")) throw new Error("offline"); };
  const result = await migrateRenamedPackages(options);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].message, "offline");
  assert.deepEqual(options.global.packages, [source("vipi-editor"), source("vipir-themes")]);
});

test("untrusted project package declarations are not read or changed", async () => {
  const options = fixture([source("vipi")], [source("pi-me-jump-mode")]);
  options.includeProject = false;
  options.settingsManager.getProjectSettings = () => { throw new Error("must not read"); };
  await migrateRenamedPackages(options);
  assert.deepEqual(options.project.packages, [source("pi-me-jump-mode")]);
});
