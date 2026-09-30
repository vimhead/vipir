export const vipiPlatforms = ["darwin", "linux", "win32", "wsl"] as const;
export type VipiPlatform = typeof vipiPlatforms[number];

export const vipiExtensionIds = [
	"pi-background-jobs",
	"pi-web-access",
	"pi-vipi-themes",
	"norn",
	"vipi-editor",
] as const;
export type VipiExtensionId = typeof vipiExtensionIds[number];

export const vipiBinaryCommands = ["macism", "norn"] as const;
export type VipiBinaryCommand = typeof vipiBinaryCommands[number];

export type VipiUnsupportedReason = "not-implemented" | "missing-upstream-support" | "requires-platform-api";

export type VipiSystemDependency =
	| { type: "binary"; command: VipiBinaryCommand }
	| { type: "oneOf"; dependencies: readonly VipiSystemDependency[] };

export type VipiPlatformSupport =
	| { supported: true; dependencies?: readonly VipiSystemDependency[] }
	| { supported: false; reason: VipiUnsupportedReason };

export interface VipiExtension {
	id: VipiExtensionId;
	name: string;
	description: string;
	source: string;
	tags?: readonly string[];
	homepage?: string;
	notes?: string;
	extensionDependencies?: readonly VipiExtensionId[];
	platformSupport?: Partial<Record<VipiPlatform, VipiPlatformSupport>>;
}

export const vipiEditorFeatures = ["jump-mode", "command-palette", "input-source"] as const;
export type VipiEditorFeature = typeof vipiEditorFeatures[number];

export interface VipiState {
	disabled: VipiExtensionId[];
	editorDisabledFeatures?: VipiEditorFeature[];
}

export interface VipiExtensionStatus {
	extension: VipiExtension;
	desired: boolean;
	configured: boolean;
	state: "installed" | "not-installed" | "pending-install" | "pending-remove";
}

export interface VipiOperationTarget {
	id: string;
	name: string;
	description: string;
	source: string;
}

export interface VipiOperationError {
	extension: VipiOperationTarget;
	action: "install" | "remove" | "update" | "save" | "refresh";
	message: string;
}

export interface VipiSyncResult {
	installed: VipiExtension[];
	removed: VipiOperationTarget[];
	skipped: VipiExtension[];
	errors: VipiOperationError[];
}

export interface VipiUpdateResult {
	updated: VipiExtension[];
	skipped: VipiExtension[];
	errors: VipiOperationError[];
}

export type VipiProgressCallback = (message: string) => void;
