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
		id: "vipi-editor",
		name: "vipi-editor",
		description: "Coordinated Vim prompt, inputs, textareas, jump mode, and command palette.",
		source: "git:github.com/vimhead/vipi-editor",
		tags: ["editor", "vim", "prompt", "inputs", "focus", "commands"],
		notes: "Configure features with /vipi-editor. Keyboard-layout switching uses macism on macOS.",
	},
];
