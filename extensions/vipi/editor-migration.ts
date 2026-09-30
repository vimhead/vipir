import type { PackageManager } from "@earendil-works/pi-coding-agent";
import type { VipiOperationError, VipiOperationTarget, VipiProgressCallback } from "./types.ts";

export const editorPackageSource = "git:github.com/vimhead/vipi-editor";

export function getRetiredEditorPackage(source: string): VipiOperationTarget | undefined {
	const match = /^(?:git:)?(?:https:\/\/)?github\.com\/vimhead\/(pi-me(?:-core|-fields)?)(?:\.git)?(?:@[^\s]+)?\/?$/.exec(source);
	if (!match) return undefined;
	return { id: match[1], name: match[1], description: "Replaced by vipi-editor", source };
}

export function removeRetiredEditorSources(options: {
	packageManager: Pick<PackageManager, "listConfiguredPackages" | "removeSourceFromSettings">;
	canReplaceEditor: boolean;
	onProgress: VipiProgressCallback | undefined;
}): { removed: VipiOperationTarget[]; errors: VipiOperationError[] } {
	const removed: VipiOperationTarget[] = [];
	const errors: VipiOperationError[] = [];
	if (!options.canReplaceEditor) return { removed, errors };
	for (const configured of options.packageManager.listConfiguredPackages()) {
		const extension = getRetiredEditorPackage(configured.source);
		if (!extension) continue;
		try {
			options.onProgress?.(`Replacing ${extension.name} with vipi-editor...`);
			if (options.packageManager.removeSourceFromSettings(configured.source, { local: configured.scope === "project" })) removed.push(extension);
		} catch (error) {
			errors.push({ extension, action: "remove", message: error instanceof Error ? error.message : String(error) });
		}
	}
	return { removed, errors };
}
