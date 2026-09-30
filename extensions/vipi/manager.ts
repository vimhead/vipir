import { spawn } from "node:child_process";
import {
	DefaultPackageManager,
	getAgentDir,
	SettingsManager,
	type ExtensionContext,
	type PackageManager,
} from "@earendil-works/pi-coding-agent";
import { vipiExtensions } from "./catalog.ts";
import { writeVipiState } from "./state.ts";
import type {
	VipiExtension,
	VipiExtensionId,
	VipiExtensionStatus,
	VipiOperationTarget,
	VipiProgressCallback,
	VipiState,
	VipiSyncResult,
	VipiUpdateResult,
} from "./types.ts";

const VIPI_STATE_EXTENSION: VipiOperationTarget = {
	id: "vipi-state",
	name: "Vipi state",
	description: "Vipi state file",
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
		if (configured.installedPath) sources.add(configured.installedPath);
	}
	return sources;
}

export function getDesiredEnabledIds(state: VipiState): Set<VipiExtensionId> {
	const enabledIds = new Set(vipiExtensions.filter((extension) => !state.disabled.includes(extension.id)).map((extension) => extension.id));
	let changed: boolean;
	do {
		changed = false;
		for (const extension of vipiExtensions) {
			if (enabledIds.has(extension.id) && extension.extensionDependencies?.some((id) => !enabledIds.has(id))) {
				enabledIds.delete(extension.id);
				changed = true;
			}
		}
	} while (changed);
	return enabledIds;
}

export function getDesiredExtensions(state: VipiState): VipiExtension[] {
	const enabledIds = getDesiredEnabledIds(state);
	return vipiExtensions.filter((extension) => enabledIds.has(extension.id));
}

export async function getConfiguredVipiSources(ctx: ExtensionContext): Promise<Set<string>> {
	const { packageManager } = createPackageManager(ctx);
	return configuredSources(packageManager);
}

export function getVipiExtensionStatuses(state: VipiState, configured: Set<string>): VipiExtensionStatus[] {
	const enabledIds = getDesiredEnabledIds(state);

	return vipiExtensions.map((extension) => {
		const desired = enabledIds.has(extension.id);
		const isConfigured = configured.has(extension.source);
		let rowState: VipiExtensionStatus["state"];

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

export async function syncVipiExtensions(
	ctx: ExtensionContext,
	state: VipiState,
	onProgress?: VipiProgressCallback,
): Promise<VipiSyncResult> {
	const result: VipiSyncResult = {
		installed: [],
		removed: [],
		skipped: [],
		errors: [],
	};

	try {
		onProgress?.("Saving Vipi extension state...");
		await writeVipiState(state, getAgentDir());
	} catch (error) {
		result.errors.push({
			extension: VIPI_STATE_EXTENSION,
			action: "save",
			message: getMessage(error),
		});
		return result;
	}

	const { packageManager, settingsManager } = createPackageManager(ctx);
	let configured = configuredSources(packageManager);
	const desiredIds = getDesiredEnabledIds(state);

	const skipped = new Set<string>();
	for (const extension of vipiExtensions) {
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

	for (const extension of [...vipiExtensions].reverse()) {
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

	result.skipped.push(...vipiExtensions.filter((extension) => skipped.has(extension.id)));

	onProgress?.("Saving Pi settings...");
	await settingsManager.flush();
	return result;
}

export async function updateVipiExtensions(
	ctx: ExtensionContext,
	state: VipiState,
	onProgress?: VipiProgressCallback,
): Promise<VipiUpdateResult> {
	const result: VipiUpdateResult = {
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

export function syncChanged(result: VipiSyncResult): boolean {
	return result.installed.length > 0 || result.removed.length > 0;
}

export function updateChanged(result: VipiUpdateResult): boolean {
	return result.updated.length > 0;
}
