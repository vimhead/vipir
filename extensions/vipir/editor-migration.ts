import type { PackageManager } from "@earendil-works/pi-coding-agent";
import type { VipirOperationError, VipirOperationTarget, VipirProgressCallback } from "./types.ts";

export const editorPackageSource = "git:github.com/vimhead/vipir-editor";

export function getRetiredEditorPackage(source: string): VipirOperationTarget | undefined {
	const match = /^(?:git:)?(?:https:\/\/)?github\.com\/vimhead\/(pi-me(?:-core|-fields)?)(?:\.git)?(?:@[^\s]+)?\/?$/.exec(source);
	if (!match) return undefined;
	return { id: match[1], name: match[1], description: "Replaced by vipir-editor", source };
}

export function removeRetiredEditorSources(options: {
	packageManager: Pick<PackageManager, "listConfiguredPackages" | "removeSourceFromSettings">;
	canReplaceEditor: boolean;
	onProgress: VipirProgressCallback | undefined;
}): { removed: VipirOperationTarget[]; errors: VipirOperationError[] } {
	const removed: VipirOperationTarget[] = [];
	const errors: VipirOperationError[] = [];
	if (!options.canReplaceEditor) return { removed, errors };
	for (const configured of options.packageManager.listConfiguredPackages()) {
		const extension = getRetiredEditorPackage(configured.source);
		if (!extension) continue;
		try {
			options.onProgress?.(`Replacing ${extension.name} with vipir-editor...`);
			if (options.packageManager.removeSourceFromSettings(configured.source, { local: configured.scope === "project" })) removed.push(extension);
		} catch (error) {
			errors.push({ extension, action: "remove", message: error instanceof Error ? error.message : String(error) });
		}
	}
	return { removed, errors };
}
