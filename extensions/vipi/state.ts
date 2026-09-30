import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { vipiExtensionIds, vipiEditorFeatures, type VipiExtensionId, type VipiState } from "./types.ts";

export const defaultVipiState: VipiState = { disabled: [] };

export class VipiStateReadError extends Error {
	constructor(message: string, public readonly path: string) {
		super(message);
		this.name = "VipiStateReadError";
	}
}

export function getVipiStatePath(agentDir: string): string {
	return join(agentDir, "vipi.json");
}

export function normalizeVipiState(value: unknown): VipiState {
	const state = value && typeof value === "object" ? value as Record<string, unknown> : {};
	const disabled = state.disabled ?? state.disabledPrimary;
	const allowedIds = new Set<string>(vipiExtensionIds);
	const savedFeatures = state.editorDisabledFeatures;
	const legacyFeatures = Array.isArray(savedFeatures)
		? vipiEditorFeatures.filter((feature) => savedFeatures.includes(feature)).map((feature) => `pi-me-${feature}`)
		: [];
	const ids = [...(Array.isArray(disabled) ? disabled : []), ...legacyFeatures]
		.map((id) => id === "pi-yappi-themes" ? "pi-vipi-themes" : id === "pi-me" ? "vipi-editor" : id)
		.filter((id): id is VipiExtensionId => typeof id === "string" && allowedIds.has(id));
	return {
		disabled: [...new Set(ids)].sort((left, right) => left.localeCompare(right)),
		...(state.editorPluginsMigrated === true ? { editorPluginsMigrated: true as const } : {}),
	};
}

export function cloneVipiState(state: VipiState): VipiState {
	return {
		disabled: [...state.disabled],
		...(state.editorPluginsMigrated ? { editorPluginsMigrated: true as const } : {}),
	};
}

export function vipiStatesEqual(left: VipiState, right: VipiState): boolean {
	return JSON.stringify(normalizeVipiState(left)) === JSON.stringify(normalizeVipiState(right));
}

async function readStateFile(path: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
		throw new VipiStateReadError(`Failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`, path);
	}
}

export async function readVipiState(agentDir: string): Promise<VipiState> {
	const current = await readStateFile(getVipiStatePath(agentDir));
	const state = normalizeVipiState(current === undefined ? await readStateFile(join(agentDir, "yappi.json")) : current);
	if (state.editorPluginsMigrated) return state;
	const path = join(agentDir, "vipi-editor.json");
	const legacy = await readStateFile(path);
	if (legacy === undefined) return state;
	if (!legacy || typeof legacy !== "object" || !("disabled" in legacy) || !Array.isArray(legacy.disabled) ||
		!legacy.disabled.every((value) => vipiEditorFeatures.some((feature) => feature === value))) {
		throw new VipiStateReadError(`Invalid disabled editor features in ${path}`, path);
	}
	const pluginIds = new Set(vipiEditorFeatures.map((feature) => `pi-me-${feature}`));
	return normalizeVipiState({
		disabled: [...state.disabled.filter((id) => !pluginIds.has(id)), ...legacy.disabled.map((feature) => `pi-me-${feature}`)],
		editorPluginsMigrated: true,
	});
}

export async function writeVipiState(state: VipiState, agentDir: string): Promise<VipiState> {
	const normalized = normalizeVipiState({ ...state, editorPluginsMigrated: true });
	const path = getVipiStatePath(agentDir);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(normalized, null, "\t")}\n`, "utf8");
	return normalized;
}
