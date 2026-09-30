import { spawn } from "node:child_process";
import {
	DefaultPackageManager,
	getAgentDir,
	SettingsManager,
	type ExtensionContext,
	type PackageManager,
} from "@earendil-works/pi-coding-agent";
import { vipirExtensions } from "./catalog.ts";
import { editorPackageSource, removeRetiredEditorSources } from "./editor-migration.ts";
import { writeVipirState } from "./state.ts";
import { migrateRenamedPackages } from "./package-migration.ts";
import { parseManagedSource } from "./package-names.ts";
import type {
	VipirExtension,
	VipirExtensionId,
	VipirExtensionStatus,
	VipirOperationTarget,
	VipirProgressCallback,
	VipirState,
	VipirSyncResult,
	VipirUpdateResult,
} from "./types.ts";

const VIPIR_STATE_EXTENSION: VipirOperationTarget = {
	id: "vipir-state",
	name: "Vipir state",
	description: "Vipir state file",
	source: getAgentDir(),
};

interface PackageManagerBundle {
	packageManager: PackageManager;
	settingsManager: SettingsManager;
}

interface QuietablePackageManager extends PackageManager {
	spawnCommand?: (command: string, args: string[], options?: { cwd?: string }) => ReturnType<typeof spawn>;
}

function silencePackageManagerOutput(packageManager: PackageManager): PackageManager {
	// DefaultPackageManager inherits child process stdio in interactive mode, which lets
	// git/npm progress output write through Pi custom UIs and corrupt bordered layouts.
	const quietable = packageManager as QuietablePackageManager;
	if (typeof quietable.spawnCommand !== "function") return packageManager;

	quietable.spawnCommand = (command, args, options) => spawn(command, args, {
		cwd: options?.cwd,
		env: process.env,
		stdio: "ignore",
	});
	return packageManager;
}

function createPackageManager(ctx: ExtensionContext): PackageManagerBundle {
	const settingsManager = SettingsManager.create(ctx.cwd, getAgentDir(), {
		projectTrusted: ctx.isProjectTrusted(),
	});

	return {
		settingsManager,
		packageManager: silencePackageManagerOutput(new DefaultPackageManager({
			cwd: ctx.cwd,
			agentDir: getAgentDir(),
			settingsManager,
		})),
	};
}

function getMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function configuredSources(packageManager: PackageManager): Set<string> {
	const sources = new Set<string>();
	for (const configured of packageManager.listConfiguredPackages()) {
		sources.add(configured.source);
		const parsed = parseManagedSource(configured.source);
		if (parsed && !parsed.isRenamed) sources.add(parsed.canonicalSource);
		if (configured.installedPath) sources.add(configured.installedPath);
	}
	return sources;
}

export function getDesiredEnabledIds(state: VipirState): Set<VipirExtensionId> {
	const enabledIds = new Set(vipirExtensions.filter((extension) => !state.disabled.includes(extension.id)).map((extension) => extension.id));
	let changed: boolean;
	do {
		changed = false;
		for (const extension of vipirExtensions) {
			if (enabledIds.has(extension.id) && extension.extensionDependencies?.some((id) => !enabledIds.has(id))) {
				enabledIds.delete(extension.id);
				changed = true;
			}
		}
	} while (changed);
	return enabledIds;
}

export function getDesiredExtensions(state: VipirState): VipirExtension[] {
	const enabledIds = getDesiredEnabledIds(state);
	return vipirExtensions.filter((extension) => enabledIds.has(extension.id));
}

export async function getConfiguredVipirSources(ctx: ExtensionContext): Promise<Set<string>> {
	const { packageManager } = createPackageManager(ctx);
	return configuredSources(packageManager);
}

export function getVipirExtensionStatuses(state: VipirState, configured: Set<string>): VipirExtensionStatus[] {
	const enabledIds = getDesiredEnabledIds(state);

	return vipirExtensions.map((extension) => {
		const desired = enabledIds.has(extension.id);
		const isConfigured = configured.has(extension.source);
		let rowState: VipirExtensionStatus["state"];

		if (desired && isConfigured) rowState = "installed";
		else if (desired && !isConfigured) rowState = "pending-install";
		else if (!desired && isConfigured) rowState = "pending-remove";
		else rowState = "not-installed";

		return {
			extension,
			desired,
			configured: isConfigured,
			state: rowState,
		};
	});
}

export async function syncVipirExtensions(
	ctx: ExtensionContext,
	state: VipirState,
	onProgress?: VipirProgressCallback,
): Promise<VipirSyncResult> {
	const result: VipirSyncResult = {
		installed: [],
		removed: [],
		skipped: [],
		errors: [],
	};

	try {
		onProgress?.("Saving Vipir extension state...");
		await writeVipirState(state, getAgentDir());
	} catch (error) {
		result.errors.push({
			extension: VIPIR_STATE_EXTENSION,
			action: "save",
			message: getMessage(error),
		});
		return result;
	}

	const { packageManager, settingsManager } = createPackageManager(ctx);
	const desiredIds = getDesiredEnabledIds(state);
	const renamed = await migrateRenamedPackages({
		packageManager, settingsManager, onProgress,
		includeProject: ctx.isProjectTrusted(),
		isEnabled: (id) => id === "vipir" || desiredIds.has(id as VipirExtensionId),
	});
	result.removed.push(...renamed.removed);
	result.errors.push(...renamed.errors);
	if (renamed.errors.length) {
		await settingsManager.flush();
		return result;
	}
	const configured = configuredSources(packageManager);

	const skipped = new Set<string>();
	for (const extension of vipirExtensions) {
		const desired = desiredIds.has(extension.id);
		const isConfigured = configured.has(extension.source);
		if (!desired || isConfigured) {
			skipped.add(extension.id);
			continue;
		}

		try {
			onProgress?.(`Installing ${extension.name}...`);
			await packageManager.installAndPersist(extension.source);
			configured.add(extension.source);
			result.installed.push(extension);
		} catch (error) {
			result.errors.push({
				extension,
				action: "install",
				message: getMessage(error),
			});
		}
	}

	for (const extension of [...vipirExtensions].reverse()) {
		const desired = desiredIds.has(extension.id);
		const isConfigured = configured.has(extension.source);
		if (desired || !isConfigured) continue;

		skipped.delete(extension.id);
		try {
			onProgress?.(`Removing ${extension.name}...`);
			await packageManager.removeAndPersist(extension.source);
			configured.delete(extension.source);
			result.removed.push(extension);
		} catch (error) {
			result.errors.push({
				extension,
				action: "remove",
				message: getMessage(error),
			});
		}
	}

	const migration = removeRetiredEditorSources({
		packageManager,
		canReplaceEditor: !desiredIds.has("vipir-editor") || configured.has(editorPackageSource),
		onProgress,
	});
	result.removed.push(...migration.removed);
	result.errors.push(...migration.errors);
	result.skipped.push(...vipirExtensions.filter((extension) => skipped.has(extension.id)));

	onProgress?.("Saving Pi settings...");
	await settingsManager.flush();
	return result;
}

export async function updateVipirExtensions(
	ctx: ExtensionContext,
	state: VipirState,
	onProgress?: VipirProgressCallback,
): Promise<VipirUpdateResult> {
	const result: VipirUpdateResult = {
		updated: [],
		skipped: [],
		errors: [],
	};
	const { packageManager, settingsManager } = createPackageManager(ctx);
	const configured = configuredSources(packageManager);

	for (const extension of getDesiredExtensions(state)) {
		if (!configured.has(extension.source)) {
			result.skipped.push(extension);
			continue;
		}

		try {
			onProgress?.(`Updating ${extension.name}...`);
			await packageManager.update(extension.source);
			result.updated.push(extension);
		} catch (error) {
			result.errors.push({
				extension,
				action: "update",
				message: getMessage(error),
			});
		}
	}

	onProgress?.("Saving Pi settings...");
	await settingsManager.flush();
	return result;
}

export function syncChanged(result: VipirSyncResult): boolean {
	return result.installed.length > 0 || result.removed.length > 0;
}

export function updateChanged(result: VipirUpdateResult): boolean {
	return result.updated.length > 0;
}
