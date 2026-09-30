import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { vipiExtensions } from "./catalog.ts";
import { getConfiguredVipiSources, getDesiredExtensions } from "./manager.ts";
import { readVipiState } from "./state.ts";
import { openVipiTui } from "./ui.ts";

export default function vipi(pi: ExtensionAPI) {
	pi.registerCommand("vipi", {
		description: "Manage Vipi extensions",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/vipi requires TUI mode", "error");
				return;
			}

			const result = await openVipiTui(ctx);
			if (result.action === "reload") {
				await ctx.reload();
				return;
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		try {
			const state = await readVipiState(getAgentDir());
			const desiredSources = new Set(getDesiredExtensions(state).map((extension) => extension.source));
			const configuredSources = await getConfiguredVipiSources(ctx);
			const hasPendingChanges = vipiExtensions.some((extension) => {
				const desired = desiredSources.has(extension.source);
				const configured = configuredSources.has(extension.source);
				return desired !== configured;
			});

			ctx.ui.setStatus("vipi", hasPendingChanges ? ctx.ui.theme.fg("warning", "vipi: pending") : undefined);
		} catch {
			ctx.ui.setStatus("vipi", ctx.ui.theme.fg("warning", "vipi: state error"));
		}
	});
}
