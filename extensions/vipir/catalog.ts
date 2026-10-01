import type { VipirExtension } from "./types.ts";

export const vipirExtensions: readonly VipirExtension[] = [
	{
		id: "vipir-background-jobs",
		name: "vipir-background-jobs",
		description: "Start, monitor, and manage long-running shell commands without blocking Pi.",
		source: "git:github.com/vimhead/vipir-background-jobs",

		tags: ["jobs", "shell", "background", "tools", "tui"],
	},
	{
		id: "vipir-web-access",
		name: "vipir-web-access",
		description: "Web search, URL fetching, GitHub repo cloning, PDF extraction, and video analysis tools.",
		source: "git:github.com/vimhead/vipir-web-access",

		tags: ["web", "search", "fetch", "github", "pdf", "video"],
		homepage: "https://github.com/vimhead/vipir-web-access#readme",
	},
	{
		id: "vipir-themes",
		name: "vipir-themes",
		description: "Curated theme collection for the Pi coding agent.",
		source: "git:github.com/vimhead/vipir-themes",

		tags: ["theme", "colors", "catppuccin", "gruvbox", "tokyo-night"],
	},
	{
		id: "norn",
		name: "pi-norn",
		description: "Connect Pi to the installed Norn workflow runtime.",
		source: "npm:@vimhead.dev/pi-norn@tip",

		tags: ["workflows", "agents", "authoring"],
		homepage: "https://github.com/vimhead/norn#readme",
		notes: "Install the Norn CLI separately; use norn on PATH or select it with --norn-executable.",
		platformSupport: {
			darwin: { supported: true, dependencies: [{ type: "binary", command: "norn" }] },
			linux: { supported: true, dependencies: [{ type: "binary", command: "norn" }] },
			win32: { supported: true, dependencies: [{ type: "binary", command: "norn" }] },
			wsl: { supported: true, dependencies: [{ type: "binary", command: "norn" }] },
		},
	},
	{
		id: "vipir-editor",
		name: "vipir-editor",
		description: "Vim engine, prompt, inputs, and textareas with shared focus coordination.",
		source: "git:github.com/vimhead/vipir-editor",
		tags: ["editor", "vim", "prompt", "inputs", "focus"],
	},
	{
		id: "vipir-jump-mode",
		name: "vipir-jump-mode",
		description: "Jump mode for vipir-editor.",
		source: "git:github.com/vimhead/vipir-jump-mode",
		tags: ["editor", "vim", "jump"],
		extensionDependencies: ["vipir-editor"],
	},
	{
		id: "vipir-command-palette",
		name: "vipir-command-palette",
		description: "Command palette using vipir-editor fields and focus coordination.",
		source: "git:github.com/vimhead/vipir-command-palette",
		tags: ["editor", "commands", "palette"],
		extensionDependencies: ["vipir-editor"],
	},
	{
		id: "vipir-input-source",
		name: "vipir-input-source",
		description: "macOS keyboard-layout switching for the focused vipir-editor control.",
		source: "git:github.com/vimhead/vipir-input-source",
		tags: ["editor", "input-source", "keyboard"],
		extensionDependencies: ["vipir-editor"],
		platformSupport: {
			darwin: { supported: true, dependencies: [{ type: "binary", command: "macism" }] },
			linux: { supported: false, reason: "not-implemented" },
			win32: { supported: false, reason: "not-implemented" },
			wsl: { supported: false, reason: "not-implemented" },
		},
	},
];
