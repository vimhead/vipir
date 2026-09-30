import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { editorPluginIds, renamePackageId } from "./package-names.ts";
import { vipirExtensionIds, vipirEditorFeatures, type VipirExtensionId, type VipirState } from "./types.ts";

export const defaultVipirState: VipirState = { disabled: [] };

export class VipirStateReadError extends Error {
	constructor(message: string, public readonly path: string) {
		super(message);
		this.name = "VipirStateReadError";
	}
}

export function getVipirStatePath(agentDir: string): string {
	return join(agentDir, "vipir.json");
}

export function normalizeVipirState(value: unknown): VipirState {
	const state = value && typeof value === "object" ? value as Record<string, unknown> : {};
	const disabled = state.disabled ?? state.disabledPrimary;
	const allowedIds = new Set<string>(vipirExtensionIds);
	const savedFeatures = state.editorDisabledFeatures;
	const legacyFeatures = Array.isArray(savedFeatures)
		? vipirEditorFeatures.filter((feature) => savedFeatures.includes(feature)).map((feature) => editorPluginIds[feature])
		: [];
	const ids = [...(Array.isArray(disabled) ? disabled : []), ...legacyFeatures]
		.map((id) => typeof id === "string" ? renamePackageId(id) : id)
		.filter((id): id is VipirExtensionId => typeof id === "string" && allowedIds.has(id));
	return {
		disabled: [...new Set(ids)].sort((left, right) => left.localeCompare(right)),
		...(state.editorPluginsMigrated === true ? { editorPluginsMigrated: true as const } : {}),
	};
}

export function cloneVipirState(state: VipirState): VipirState {
	return {
		disabled: [...state.disabled],
		...(state.editorPluginsMigrated ? { editorPluginsMigrated: true as const } : {}),
	};
}

export function vipirStatesEqual(left: VipirState, right: VipirState): boolean {
	return JSON.stringify(normalizeVipirState(left)) === JSON.stringify(normalizeVipirState(right));
}

async function readStateFile(path: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
		throw new VipirStateReadError(`Failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`, path);
	}
}

export async function readVipirState(agentDir: string): Promise<VipirState> {
	let current = await readStateFile(getVipirStatePath(agentDir));
	if (current === undefined) current = await readStateFile(join(agentDir, "vipi.json"));
	if (current === undefined) current = await readStateFile(join(agentDir, "yappi.json"));
	const state = normalizeVipirState(current);
	if (state.editorPluginsMigrated) return state;
	const path = join(agentDir, "vipi-editor.json");
	const legacy = await readStateFile(path);
	if (legacy === undefined) return state;
	if (!legacy || typeof legacy !== "object" || !("disabled" in legacy) || !Array.isArray(legacy.disabled) ||
		!legacy.disabled.every((value) => vipirEditorFeatures.some((feature) => feature === value))) {
		throw new VipirStateReadError(`Invalid disabled editor features in ${path}`, path);
	}
	const pluginIds = new Set(Object.values(editorPluginIds));
	return normalizeVipirState({
		disabled: [...state.disabled.filter((id) => !pluginIds.has(id)), ...legacy.disabled.map((feature) => editorPluginIds[feature])],
		editorPluginsMigrated: true,
	});
}

export async function writeVipirState(state: VipirState, agentDir: string): Promise<VipirState> {
	const normalized = normalizeVipirState({ ...state, editorPluginsMigrated: true });
	const path = getVipirStatePath(agentDir);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(normalized, null, "\t")}\n`, "utf8");
	return normalized;
}
