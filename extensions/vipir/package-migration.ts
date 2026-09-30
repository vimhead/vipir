import type { PackageManager, PackageSource, SettingsManager } from "@earendil-works/pi-coding-agent";
import { parseManagedSource, renameExtensionFilter } from "./package-names.ts";
import type { VipirOperationError, VipirOperationTarget, VipirProgressCallback } from "./types.ts";

function sourceOf(entry: PackageSource): string {
	return typeof entry === "string" ? entry : entry.source;
}

export function renamePackageSetting(entry: PackageSource): PackageSource {
	const parsed = parseManagedSource(sourceOf(entry));
	if (!parsed?.isRenamed) return entry;
	return typeof entry === "string" ? parsed.source : {
		...entry,
		source: parsed.source,
		...(entry.extensions ? { extensions: entry.extensions.map(renameExtensionFilter) } : {}),
	};
}

export async function migrateRenamedPackages(options: {
	packageManager: Pick<PackageManager, "install">;
	settingsManager: Pick<SettingsManager, "getGlobalSettings" | "getProjectSettings" | "setPackages" | "setProjectPackages">;
	isEnabled: (id: string) => boolean;
	includeProject: boolean;
	onProgress?: VipirProgressCallback;
}): Promise<{ removed: VipirOperationTarget[]; errors: VipirOperationError[] }> {
	const removed: VipirOperationTarget[] = [];
	const errors: VipirOperationError[] = [];
	for (const local of options.includeProject ? [false, true] : [false]) {
		let entries = [...((local ? options.settingsManager.getProjectSettings() : options.settingsManager.getGlobalSettings()).packages ?? [])];
		for (const original of [...entries]) {
			const renamed = renamePackageSetting(original);
			if (renamed === original) continue;
			const parsed = parseManagedSource(sourceOf(renamed))!;
			const existing = entries.find(entry => {
				const candidate = parseManagedSource(sourceOf(entry));
				return candidate?.id === parsed.id && !candidate.isRenamed;
			});
			const replacement = existing ?? renamed;
			const extension = { id: parsed.id, name: parsed.id, description: "Renamed package", source: sourceOf(original) };
			try {
				options.onProgress?.(`Migrating ${sourceOf(original)} to ${sourceOf(replacement)}...`);
				// Keep the old declaration usable if fetching its replacement fails.
				if (options.isEnabled(parsed.id)) await options.packageManager.install(sourceOf(replacement), { local });
				entries = entries.flatMap(entry => entry !== original ? [entry] : existing ? [] : [replacement]);
				if (local) options.settingsManager.setProjectPackages(entries);
				else options.settingsManager.setPackages(entries);
				removed.push(extension);
			} catch (error) {
				errors.push({ extension, action: "install", message: error instanceof Error ? error.message : String(error) });
			}
		}
	}
	return { removed, errors };
}
