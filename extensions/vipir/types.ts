export const vipirPlatforms = ["darwin", "linux", "win32", "wsl"] as const;
export type VipirPlatform = typeof vipirPlatforms[number];

export const vipirExtensionIds = [
	"vipir-background-jobs",
	"vipir-web-access",
	"vipir-themes",
	"norn",
	"vipir-editor",
	"vipir-jump-mode",
	"vipir-command-palette",
	"vipir-input-source",
] as const;
export type VipirExtensionId = typeof vipirExtensionIds[number];

export const vipirBinaryCommands = ["macism", "norn"] as const;
export type VipirBinaryCommand = typeof vipirBinaryCommands[number];

export type VipirUnsupportedReason = "not-implemented" | "missing-upstream-support" | "requires-platform-api";

export type VipirSystemDependency =
	| { type: "binary"; command: VipirBinaryCommand }
	| { type: "oneOf"; dependencies: readonly VipirSystemDependency[] };

export type VipirPlatformSupport =
	| { supported: true; dependencies?: readonly VipirSystemDependency[] }
	| { supported: false; reason: VipirUnsupportedReason };

export interface VipirExtension {
	id: VipirExtensionId;
	name: string;
	description: string;
	source: string;
	tags?: readonly string[];
	homepage?: string;
	notes?: string;
	extensionDependencies?: readonly VipirExtensionId[];
	platformSupport?: Partial<Record<VipirPlatform, VipirPlatformSupport>>;
}

export interface VipirState {
	disabled: VipirExtensionId[];
}

export interface VipirExtensionStatus {
	extension: VipirExtension;
	desired: boolean;
	configured: boolean;
	state: "installed" | "not-installed" | "pending-install" | "pending-remove";
}

export interface VipirOperationTarget {
	id: string;
	name: string;
	description: string;
	source: string;
}

export interface VipirOperationError {
	extension: VipirOperationTarget;
	action: "install" | "remove" | "update" | "save" | "refresh";
	message: string;
}

export interface VipirSyncResult {
	installed: VipirExtension[];
	removed: VipirOperationTarget[];
	skipped: VipirExtension[];
	errors: VipirOperationError[];
}

export interface VipirUpdateResult {
	updated: VipirExtension[];
	skipped: VipirExtension[];
	errors: VipirOperationError[];
}

export type VipirProgressCallback = (message: string) => void;
