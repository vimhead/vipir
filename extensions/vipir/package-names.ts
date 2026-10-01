import { vipirExtensions } from "./catalog.ts";

const managedSources = new Set(["git:github.com/vimhead/vipir", ...vipirExtensions.map(extension => extension.source)]);

export function parseManagedSource(source: string): { canonicalSource: string } | undefined {
	const match = /^(?:git:)?(?:https:\/\/)?github\.com\/vimhead\/([^/@]+?)(?:\.git)?(?:@[^\s]+)?\/?$/.exec(source);
	if (!match) return undefined;
	const canonicalSource = `git:github.com/vimhead/${match[1]}`;
	return managedSources.has(canonicalSource) ? { canonicalSource } : undefined;
}
