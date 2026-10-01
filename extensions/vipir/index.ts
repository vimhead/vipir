import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { vipirExtensions } from "./catalog.ts";
import { getConfiguredVipirSources, getDesiredExtensions } from "./manager.ts";
import { readVipirState } from "./state.ts";
import { openVipirTui } from "./ui.ts";

export default function vipir(pi: ExtensionAPI) {
	const command: Parameters<ExtensionAPI["registerCommand"]>[1] = {
		description: "Manage Vipir extensions",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/vipir requires TUI mode", "error");
				return;
			}

			const result = await openVipirTui(ctx);
			if (result.action === "reload") {
				await ctx.reload();
				return;
			}
		},
	};
	pi.registerCommand("vipir", command);

	pi.on("session_start", async (_event, ctx) => {
		try {
			const state = await readVipirState(getAgentDir());
			const desiredSources = new Set(getDesiredExtensions(state).map((extension) => extension.source));
			const configuredSources = await getConfiguredVipirSources(ctx);
			const hasPendingChanges = vipirExtensions.some((extension) => {
				const desired = desiredSources.has(extension.source);
				const configured = configuredSources.has(extension.source);
				return desired !== configured;
			});

			ctx.ui.setStatus("vipir", hasPendingChanges ? ctx.ui.theme.fg("warning", "vipir: pending") : undefined);
		} catch {
			ctx.ui.setStatus("vipir", ctx.ui.theme.fg("warning", "vipir: state error"));
		}
	});
}
