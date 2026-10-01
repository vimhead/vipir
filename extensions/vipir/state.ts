import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { vipirExtensionIds, type VipirExtensionId, type VipirState } from "./types.ts";

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
	const allowedIds = new Set<string>(vipirExtensionIds);
	const disabled = Array.isArray(state.disabled) ? state.disabled : [];
	const ids = disabled.filter((id): id is VipirExtensionId => typeof id === "string" && allowedIds.has(id));
	return { disabled: [...new Set(ids)].sort((left, right) => left.localeCompare(right)) };
}

export function cloneVipirState(state: VipirState): VipirState {
	return { disabled: [...state.disabled] };
}

export function vipirStatesEqual(left: VipirState, right: VipirState): boolean {
	return JSON.stringify(normalizeVipirState(left)) === JSON.stringify(normalizeVipirState(right));
}

export async function readVipirState(agentDir: string): Promise<VipirState> {
	const path = getVipirStatePath(agentDir);
	try {
		return normalizeVipirState(JSON.parse(await readFile(path, "utf8")));
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return cloneVipirState(defaultVipirState);
		throw new VipirStateReadError(`Failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`, path);
	}
}

export async function writeVipirState(state: VipirState, agentDir: string): Promise<VipirState> {
	const normalized = normalizeVipirState(state);
	const path = getVipirStatePath(agentDir);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(normalized, null, "\t")}\n`, "utf8");
	return normalized;
}
