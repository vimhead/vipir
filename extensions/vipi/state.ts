import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { vipiExtensionIds, type VipiExtensionId, type VipiState } from "./types.ts";

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
	const ids = Array.isArray(disabled)
		? disabled.map((id) => id === "pi-yappi-themes" ? "pi-vipi-themes" : id)
			.filter((id): id is VipiExtensionId => typeof id === "string" && allowedIds.has(id))
		: [];
	return { disabled: [...new Set(ids)].sort((left, right) => left.localeCompare(right)) };
}

export function cloneVipiState(state: VipiState): VipiState {
	return { disabled: [...state.disabled] };
}

export function vipiStatesEqual(left: VipiState, right: VipiState): boolean {
	return JSON.stringify(normalizeVipiState(left)) === JSON.stringify(normalizeVipiState(right));
}

async function readStateFile(path: string): Promise<VipiState | undefined> {
	try {
		return normalizeVipiState(JSON.parse(await readFile(path, "utf8")));
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
		throw new VipiStateReadError(`Failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`, path);
	}
}

export async function readVipiState(agentDir: string): Promise<VipiState> {
	return await readStateFile(getVipiStatePath(agentDir))
		?? await readStateFile(join(agentDir, "yappi.json"))
		?? cloneVipiState(defaultVipiState);
}

export async function writeVipiState(state: VipiState, agentDir: string): Promise<VipiState> {
	const normalized = normalizeVipiState(state);
	const path = getVipiStatePath(agentDir);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(normalized, null, "\t")}\n`, "utf8");
	return normalized;
}
