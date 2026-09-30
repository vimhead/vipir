import type { VipiExtension } from "./types.ts";

export const vipiExtensions: readonly VipiExtension[] = [
	{
		id: "pi-background-jobs",
		name: "pi-background-jobs",
		description: "Start, monitor, and manage long-running shell commands without blocking Pi.",
		source: "git:github.com/vimhead/pi-background-jobs",

		tags: ["jobs", "shell", "background", "tools", "tui"],
	},
	{
		id: "pi-web-access",
		name: "pi-web-access",
		description: "Web search, URL fetching, GitHub repo cloning, PDF extraction, and video analysis tools.",
		source: "git:github.com/vimhead/pi-web-access",

		tags: ["web", "search", "fetch", "github", "pdf", "video"],
		homepage: "https://github.com/vimhead/pi-web-access#readme",
	},
	{
		id: "pi-vipi-themes",
		name: "pi-vipi-themes",
		description: "Curated theme collection for the Pi coding agent.",
		source: "git:github.com/vimhead/pi-vipi-themes",

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
		id: "pi-me",
		name: "pi-me",
		description: "Modal prompt editor core for Pi.",
		source: "git:github.com/vimhead/pi-me",

		tags: ["editor", "modal", "prompt", "core"],
	},
	{
		id: "pi-me-jump-mode",
		name: "pi-me-jump-mode",
		description: "Jump mode plugin for pi-me.",
		source: "git:github.com/vimhead/pi-me-jump-mode",

		tags: ["editor", "modal", "jump"],
		extensionDependencies: ["pi-me"],
	},
	{
		id: "pi-me-command-palette",
		name: "pi-me-command-palette",
		description: "Fuzzy command palette plugin for pi-me normal mode.",
		source: "git:github.com/vimhead/pi-me-command-palette",

		tags: ["editor", "modal", "commands", "palette"],
		extensionDependencies: ["pi-me"],
	},
	{
		id: "pi-me-input-source",
		name: "pi-me-input-source",
		description: "macOS input source switching plugin for pi-me mode changes.",
		source: "git:github.com/vimhead/pi-me-input-source",

		tags: ["editor", "modal", "input-source", "keyboard"],
		extensionDependencies: ["pi-me"],
		platformSupport: {
			darwin: { supported: true, dependencies: [{ type: "binary", command: "macism" }] },
			linux: { supported: false, reason: "not-implemented" },
			win32: { supported: false, reason: "not-implemented" },
			wsl: { supported: false, reason: "not-implemented" },
		},
	},
];
