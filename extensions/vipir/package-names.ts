export const renamedPackages: Readonly<Record<string, string>> = {
	vipi: "vipir",
	"vipi-editor": "vipir-editor",
	"pi-vipi-themes": "vipir-themes",
	"pi-me-jump-mode": "vipir-jump-mode",
	"pi-me-command-palette": "vipir-command-palette",
	"vipir-jump": "vipir-jump-mode",
	"vipir-palette": "vipir-command-palette",
	"pi-me-input-source": "vipir-input-source",
	"pi-background-jobs": "vipir-background-jobs",
	"pi-web-access": "vipir-web-access",
};

export const editorPluginIds: Readonly<Record<string, string>> = {
	"jump-mode": "vipir-jump-mode",
	"command-palette": "vipir-command-palette",
	"input-source": "vipir-input-source",
};

export function renamePackageId(id: string): string {
	if (id === "pi-me") return "vipir-editor";
	if (id === "pi-yappi-themes") return "vipir-themes";
	return Object.hasOwn(renamedPackages, id) ? renamedPackages[id] : id;
}

export function parseManagedSource(source: string): { id: string; source: string; canonicalSource: string; isRenamed: boolean } | undefined {
	const match = /^(?:git:)?(?:https:\/\/)?github\.com\/vimhead\/([^/@]+?)(?:\.git)?(@[^\s]+)?\/?$/.exec(source);
	if (!match) return undefined;
	const originalId = match[1];
	const id = Object.hasOwn(renamedPackages, originalId) ? renamedPackages[originalId] : originalId;
	if (!Object.values(renamedPackages).includes(id)) return undefined;
	return {
		id,
		source: `git:github.com/vimhead/${id}${match[2] ?? ""}`,
		canonicalSource: `git:github.com/vimhead/${id}`,
		isRenamed: originalId !== id,
	};
}

export function renameExtensionFilter(filter: string): string {
	for (const [oldName, newName] of Object.entries(renamedPackages)) {
		filter = filter.replaceAll(`extensions/${oldName}/`, `extensions/${newName}/`);
	}
	return filter;
}
