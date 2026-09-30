import { getAgentDir, type ExtensionCommandContext, type KeybindingsManager, type Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, stripTerminalSequences, truncateToWidth, visibleWidth, wrapTextWithAnsi, type TUI } from "@earendil-works/pi-tui";
import { vipiExtensions } from "./catalog.ts";
import {
	getConfiguredVipiSources,
	getVipiExtensionStatuses,
	syncChanged,
	syncVipiExtensions,
	updateChanged,
	updateVipiExtensions,
} from "./manager.ts";
import {
	cloneVipiState,
	normalizeVipiState,
	readVipiState,
	writeVipiState,
	vipiStatesEqual,
} from "./state.ts";
import {
	vipiPlatforms,
	type VipiExtension,
	type VipiExtensionId,
	type VipiExtensionStatus,
	type VipiOperationTarget,
	type VipiState,
	type VipiSyncResult,
	type VipiSystemDependency,
	type VipiUpdateResult,
} from "./types.ts";

type VipiTuiResult = { action: "close" } | { action: "reload" };
type VipiMode = "normal" | "exit-prompt" | "busy" | "reload-prompt";
type LayoutMode = "single-column" | "multi-column";
type AppKeybindingName = Parameters<KeybindingsManager["getKeys"]>[0];
type SizeValue = number | `${number}%`;
type OverlayMargin = number | { top?: number; right?: number; bottom?: number; left?: number } | undefined;

const EXTENSIONS_ICON = "󰏗";
const RUN_ICON = "󰐊";
const WARNING_ICON = "󰀪";
const SUCCESS_ICON = "󰄬";
const OVERLAY_OPTIONS = {
	width: "90%",
	minWidth: 72,
	maxHeight: "90%",
	margin: 1,
} as const;
const MULTI_COLUMN_WIDTH = 96;
const MIN_LEFT_INNER = 36;
const MIN_RIGHT_INNER = 38;

const SPECIAL_KEYCAPS: Record<string, string> = {
	up: "󰁝",
	down: "󰁅",
	left: "󰁍",
	right: "󰁔",
	enter: "Enter",
	return: "Enter",
	escape: "Esc",
	esc: "Esc",
	space: "Space",
	tab: "Tab",
	backspace: "Backspace",
	delete: "Delete",
	pageUp: "PgUp",
	pageDown: "PgDn",
	pageup: "PgUp",
	pagedown: "PgDn",
	home: "Home",
	end: "End",
};

const MODIFIER_KEYCAPS: Record<string, string> = {
	ctrl: "C",
	shift: "S",
	alt: "A",
	option: "A",
	super: "Super",
};

type ThemeColor = Parameters<Theme["fg"]>[0];

interface ScrollWindow<T> {
	offset: number;
	visibleItems: T[];
	overflow: boolean;
	position?: string;
}

type VipiListRow = { type: "extension"; status: VipiExtensionStatus };

function safeText(text: string): string {
	return stripTerminalSequences(text);
}

function safeWidth(width: number): number {
	return Math.max(0, Math.floor(width));
}

function line(text: string, width: number): string {
	return truncateToWidth(text, safeWidth(width), "");
}

function padCell(text: string, width: number): string {
	const cellWidth = safeWidth(width);
	const truncated = truncateToWidth(text, cellWidth, "…");
	return `${truncated}${" ".repeat(Math.max(0, cellWidth - visibleWidth(truncated)))}`;
}

function resolveRows(value: SizeValue | undefined, totalRows: number): number {
	if (typeof value === "number") return Math.max(1, Math.floor(value));
	if (typeof value === "string" && value.endsWith("%")) {
		const percent = Number(value.slice(0, -1));
		if (Number.isFinite(percent)) return Math.max(1, Math.floor((totalRows * percent) / 100));
	}
	return Math.max(1, totalRows);
}

function verticalMarginRows(margin: OverlayMargin): number {
	if (typeof margin === "number") return Math.max(0, margin * 2);
	return Math.max(0, (margin?.top ?? 0) + (margin?.bottom ?? 0));
}

function overlayRowBudget(tui: Pick<TUI, "terminal">, options: { maxHeight?: SizeValue; margin?: OverlayMargin } = {}): number {
	const terminalRows = Math.max(1, tui.terminal.rows);
	const maxByHeight = resolveRows(options.maxHeight, terminalRows);
	const maxByMargin = Math.max(1, terminalRows - verticalMarginRows(options.margin));
	return Math.max(1, Math.min(maxByHeight, maxByMargin));
}

function scrollWindow<T>(items: readonly T[], selected: number, previousOffset: number, visibleRows: number): ScrollWindow<T> {
	const total = items.length;
	const rows = Math.max(1, visibleRows);
	const maxOffset = Math.max(0, total - rows);
	let offset = Math.max(0, Math.min(previousOffset, maxOffset));

	if (selected < offset) offset = selected;
	else if (selected >= offset + rows) offset = selected - rows + 1;

	return {
		offset,
		visibleItems: items.slice(offset, offset + rows),
		overflow: total > rows,
		position: total > rows ? `${Math.min(total, selected + 1)}/${total}` : undefined,
	};
}

function layoutMode(width: number): LayoutMode {
	return canRenderMultiColumn(width) ? "multi-column" : "single-column";
}

function canRenderMultiColumn(width: number): boolean {
	return width >= MULTI_COLUMN_WIDTH && width - MIN_LEFT_INNER - MIN_RIGHT_INNER - 3 >= 0;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function border(theme: Theme, text: string, color: ThemeColor = "border"): string {
	return theme.fg(color, text);
}

function titleText(theme: Theme, text: string, color: ThemeColor = "accent"): string {
	return theme.fg(color, theme.bold(text));
}

function sectionText(theme: Theme, text: string): string {
	return theme.bold(text);
}

function muted(theme: Theme, text: string): string {
	return theme.fg("muted", text);
}

function formatKeycap(key: string): string {
	const parts = key.split("+");
	const base = parts.pop() ?? key;
	const modifiers = parts.map((part) => MODIFIER_KEYCAPS[part] ?? part);
	const baseLabel = SPECIAL_KEYCAPS[base] ?? base;
	return modifiers.length > 0 ? `${modifiers.join("-")}-${baseLabel}` : baseLabel;
}

function firstKeyLabel(keybindings: KeybindingsManager, keybinding: AppKeybindingName): string {
	const [first] = keybindings.getKeys(keybinding);
	return first ? formatKeycap(first) : "?";
}

function moveHint(keybindings: KeybindingsManager): string {
	return `${firstKeyLabel(keybindings, "tui.select.up")}/${firstKeyLabel(keybindings, "tui.select.down")} move`;
}

function pageHint(keybindings: KeybindingsManager): string {
	return `${firstKeyLabel(keybindings, "tui.select.pageUp")}/${firstKeyLabel(keybindings, "tui.select.pageDown")} page`;
}

function confirmHint(keybindings: KeybindingsManager, label: string): string {
	return `${firstKeyLabel(keybindings, "tui.select.confirm")} ${label}`;
}

function cancelHint(keybindings: KeybindingsManager, label: string): string {
	return `${firstKeyLabel(keybindings, "tui.select.cancel")} ${label}`;
}

function keybarLine(leftActions: string[], rightActions: string[], innerWidth: number): string {
	const left = [...leftActions];
	const right = [...rightActions];
	const raw = (): string => {
		const leftText = left.length > 0 ? `  ${left.join("   ")}` : "  ";
		if (right.length === 0) return leftText;
		const rightText = `${right.join("   ")}  `;
		const gap = Math.max(1, innerWidth - visibleWidth(leftText) - visibleWidth(rightText));
		return `${leftText}${" ".repeat(gap)}${rightText}`;
	};

	while (left.length > 0 && visibleWidth(raw()) > innerWidth) left.pop();
	while (right.length > 1 && visibleWidth(raw()) > innerWidth) right.shift();
	return padCell(raw(), innerWidth);
}

function topBorder(title: string, width: number, theme: Theme, titleColor: ThemeColor = "accent"): string {
	const boxWidth = Math.max(2, width);
	const prefix = `${border(theme, "╭─ ")}${titleText(theme, title, titleColor)}${border(theme, " ")}`;
	const suffix = border(theme, "╮");
	const fill = Math.max(0, boxWidth - visibleWidth(prefix) - visibleWidth(suffix));
	return `${prefix}${border(theme, "─".repeat(fill))}${suffix}`;
}

function boxLine(content: string, width: number, theme: Theme): string {
	const boxWidth = Math.max(2, width);
	const inner = Math.max(0, boxWidth - 2);
	return `${border(theme, "│")}${padCell(` ${content}`, inner)}${border(theme, "│")}`;
}

function boxRawLine(content: string, width: number, theme: Theme): string {
	const boxWidth = Math.max(2, width);
	const inner = Math.max(0, boxWidth - 2);
	return `${border(theme, "│")}${padCell(content, inner)}${border(theme, "│")}`;
}

function separator(width: number, theme: Theme): string {
	const boxWidth = Math.max(2, width);
	return border(theme, `├${"─".repeat(Math.max(0, boxWidth - 2))}┤`);
}

function bottomBorder(width: number, theme: Theme): string {
	const boxWidth = Math.max(2, width);
	return border(theme, `╰${"─".repeat(Math.max(0, boxWidth - 2))}╯`);
}

function joinedTopBorder(leftTitle: string, rightTitle: string, width: number, leftInner: number, theme: Theme): string {
	const rightInner = Math.max(1, width - leftInner - 3);
	const leftPrefix = `${border(theme, "╭─ ")}${titleText(theme, leftTitle)}${border(theme, " ")}`;
	const leftFill = Math.max(0, leftInner + 1 - visibleWidth(leftPrefix));
	const rightPrefix = `${border(theme, "─ ")}${theme.bold(rightTitle)}${border(theme, " ")}`;
	const rightFill = Math.max(0, rightInner - visibleWidth(rightPrefix));
	return `${leftPrefix}${border(theme, "─".repeat(leftFill))}${border(theme, "┬")}${rightPrefix}${border(theme, "─".repeat(rightFill))}${border(theme, "╮")}`;
}

function joinedLine(left: string, right: string, leftInner: number, rightInner: number, theme: Theme): string {
	return `${border(theme, "│")}${padCell(` ${left}`, leftInner)}${border(theme, "│")}${padCell(` ${right}`, rightInner)}${border(theme, "│")}`;
}

function joinedSeparator(leftInner: number, rightInner: number, theme: Theme): string {
	return border(theme, `├${"─".repeat(leftInner)}┴${"─".repeat(rightInner)}┤`);
}

function formatErrorSummary(errors: Array<{ extension: VipiOperationTarget; message: string }>): string[] {
	if (errors.length === 0) return [];
	return [
		"Errors",
		...errors.slice(0, 4).map((error) => `  - ${safeText(error.extension.name)}: ${safeText(error.message)}`),
		...(errors.length > 4 ? [`  - ${errors.length - 4} more error(s)`] : []),
	];
}

function summarizeSync(result: VipiSyncResult): string {
	const parts = [`installed ${result.installed.length}`, `removed ${result.removed.length}`];
	if (result.errors.length > 0) parts.push(`${result.errors.length} error(s)`);
	return `Sync complete: ${parts.join(", ")}.`;
}

function summarizeUpdate(sync: VipiSyncResult, update: VipiUpdateResult): string {
	const parts = [
		`installed ${sync.installed.length}`,
		`removed ${sync.removed.length}`,
		`updated ${update.updated.length}`,
	];
	const errorCount = sync.errors.length + update.errors.length;
	if (errorCount > 0) parts.push(`${errorCount} error(s)`);
	return `Sync + update complete: ${parts.join(", ")}.`;
}

function statusLabel(status: VipiExtensionStatus, theme: Theme): string {
	switch (status.state) {
		case "installed":
			return theme.fg("success", "Enabled");
		case "pending-install":
			return theme.fg("warning", "Will install");
		case "pending-remove":
			return theme.fg("warning", "Will remove");
		case "not-installed":
			return theme.fg("muted", "Not installed");
	}
}

class VipiTuiComponent {
	private mode: VipiMode = "normal";
	private selectedIndex = 0;
	private listOffset = 0;
	private savedState: VipiState;
	private draftState: VipiState;
	private configuredSources: Set<string>;
	private message = "Toggle extensions, then sync or update.";
	private operationDetails: string[] = [];
	private lastListVisibleRows = 1;
	private reloadPromptCloseAfterNo = false;
	private closed = false;

	constructor(
		private readonly ctx: ExtensionCommandContext,
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		private readonly done: (result: VipiTuiResult) => void,
		state: VipiState,
		configuredSources: Set<string>,
	) {
		this.savedState = cloneVipiState(state);
		this.draftState = cloneVipiState(state);
		this.configuredSources = configuredSources;
	}

	invalidate(): void {}

	render(width: number): string[] {
		let lines: string[];

		if (this.mode === "exit-prompt") lines = this.renderExitPrompt(width);
		else if (this.mode === "busy") lines = this.renderBusy(width);
		else if (this.mode === "reload-prompt") lines = this.renderReloadPrompt(width);
		else if (vipiExtensions.length === 0) lines = this.renderEmpty(width);
		else if (layoutMode(width) === "multi-column") lines = this.renderMultiColumn(width);
		else lines = this.renderSingleColumn(width);

		return lines.map((value) => line(value, width));
	}

	handleInput(data: string): void {
		if (this.closed || this.mode === "busy") return;

		if (this.mode === "exit-prompt") {
			this.handleExitPromptInput(data);
			return;
		}

		if (this.mode === "reload-prompt") {
			this.handleReloadPromptInput(data);
			return;
		}

		if (this.keybindings.matches(data, "tui.select.up")) {
			this.moveSelection(-1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			this.moveSelection(1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageUp")) {
			this.pageSelection(-1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageDown")) {
			this.pageSelection(1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm") || matchesKey(data, "space")) {
			this.toggleSelected();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.closeOrPrompt();
			return;
		}
		if (data === "S" || data === "s") {
			void this.apply(false, false);
			return;
		}
		if (data === "U" || data === "u") {
			void this.apply(true, false);
			return;
		}
		if (data === "r") {
			void this.refreshConfiguredSources();
		}
	}

	private renderSingleColumn(width: number): string[] {
		const boxWidth = width;
		const maxRows = overlayRowBudget(this.tui, OVERLAY_OPTIONS);
		const bodyBudget = Math.max(1, maxRows - 5);
		const listRows = this.groupedListRows();
		const selectedRow = this.selectedListRowIndex(listRows);
		const detailRows = this.singleColumnDetailRows({ bodyBudget, width: Math.max(0, boxWidth - 4) });
		const listBudget = Math.max(1, bodyBudget - detailRows.length);
		const window = scrollWindow(listRows, selectedRow, this.listOffset, listBudget);
		this.listOffset = window.offset;
		this.lastListVisibleRows = listBudget;

		const position = window.overflow ? `${this.selectedIndex + 1}/${this.selectableExtensions().length}` : undefined;
		const title = `${EXTENSIONS_ICON} Vipi Extensions${position ? ` ${position}` : ""}`;
		const lines = [topBorder(title, boxWidth, this.theme)];
		for (const row of window.visibleItems) {
			lines.push(boxLine(this.renderListRow(row, Math.max(0, boxWidth - 4), boxWidth >= 84), boxWidth, this.theme));
		}
		for (const detail of detailRows) lines.push(boxLine(detail, boxWidth, this.theme));
		lines.push(separator(boxWidth, this.theme));
		lines.push(boxLine(this.screenStatus(), boxWidth, this.theme));
		lines.push(this.footerLine(this.normalKeybarLeftActions(window.overflow), [cancelHint(this.keybindings, "close")], boxWidth));
		lines.push(bottomBorder(boxWidth, this.theme));
		return lines;
	}

	private renderMultiColumn(width: number): string[] {
		const boxWidth = width;
		const maxRows = overlayRowBudget(this.tui, OVERLAY_OPTIONS);
		const bodyRows = Math.max(1, maxRows - 5);
		const leftInner = Math.min(52, Math.max(MIN_LEFT_INNER, Math.floor((boxWidth - 3) * 0.42)));
		const rightInner = boxWidth - leftInner - 3;
		const listWidth = Math.max(0, leftInner - 2);
		const detailWidth = Math.max(0, rightInner - 2);
		const listRows = this.groupedListRows();
		const selectedRow = this.selectedListRowIndex(listRows);
		const window = scrollWindow(listRows, selectedRow, this.listOffset, bodyRows);
		this.listOffset = window.offset;
		this.lastListVisibleRows = bodyRows;
		const listLines = window.visibleItems.map((row) => this.renderListRow(row, listWidth, false));
		const detailLines = this.detailLines({ includeDescription: true, includeHeading: false, width: detailWidth }).map(detail => truncateToWidth(detail, detailWidth, "…"));
		const position = window.overflow ? `${this.selectedIndex + 1}/${this.selectableExtensions().length}` : undefined;
		const title = `${EXTENSIONS_ICON} Vipi${position ? ` ${position}` : ""}`;
		const lines = [joinedTopBorder(title, "Details", boxWidth, leftInner, this.theme)];

		for (let index = 0; index < bodyRows; index++) {
			lines.push(joinedLine(listLines[index] ?? "", detailLines[index] ?? "", leftInner, rightInner, this.theme));
		}

		lines.push(joinedSeparator(leftInner, rightInner, this.theme));
		lines.push(boxLine(this.screenStatus(), boxWidth, this.theme));
		lines.push(this.footerLine(this.normalKeybarLeftActions(window.overflow), [cancelHint(this.keybindings, "close")], boxWidth));
		lines.push(bottomBorder(boxWidth, this.theme));
		return lines;
	}

	private renderEmpty(width: number): string[] {
		const boxWidth = Math.min(width, 64);
		return this.fitDialog([
			topBorder(`${EXTENSIONS_ICON} Vipi Extensions`, boxWidth, this.theme),
			boxLine("No extensions configured", boxWidth, this.theme),
			boxLine("", boxWidth, this.theme),
			boxLine(muted(this.theme, "Add curated entries in extensions/vipi/catalog.ts."), boxWidth, this.theme),
			separator(boxWidth, this.theme),
			this.footerLine([cancelHint(this.keybindings, "close")], [], boxWidth),
			bottomBorder(boxWidth, this.theme),
		], boxWidth);
	}

	private renderExitPrompt(width: number): string[] {
		const boxWidth = Math.min(width, 58);
		return this.fitDialog([
			topBorder(`${WARNING_ICON} Unsaved changes`, boxWidth, this.theme, "warning"),
			boxLine("Your selection has not been saved.", boxWidth, this.theme),
			boxLine("", boxWidth, this.theme),
			boxLine(sectionText(this.theme, "Impact"), boxWidth, this.theme),
			boxLine("  - Sync applies your extension selection", boxWidth, this.theme),
			boxLine("  - Discard closes without changing Pi settings", boxWidth, this.theme),
			separator(boxWidth, this.theme),
			this.footerLine(["S sync"], ["D discard", cancelHint(this.keybindings, "cancel")], boxWidth),
			bottomBorder(boxWidth, this.theme),
		], boxWidth);
	}

	private renderBusy(width: number): string[] {
		const details = this.operationDetails.length > 0 ? this.operationDetails : ["Progress", `  - ${this.message}`];
		const boxWidth = Math.min(width, 72);
		return this.fitDialog([
			topBorder(`${RUN_ICON} Working`, boxWidth, this.theme),
			boxLine(safeText(this.message), boxWidth, this.theme),
			boxLine("", boxWidth, this.theme),
			...details.map((detail) => boxLine(detail === "Progress" ? sectionText(this.theme, detail) : safeText(detail), boxWidth, this.theme)),
			bottomBorder(boxWidth, this.theme),
		], boxWidth);
	}

	private renderReloadPrompt(width: number): string[] {
		const closeLabel = this.reloadPromptCloseAfterNo ? "close" : "continue";
		const noHint = this.reloadPromptCloseAfterNo ? "N close" : "N continue";
		const detailLines = this.operationDetails.length > 0
			? this.operationDetails
			: ["Next step", "  - Reload Pi so extension changes take effect"];
		const boxWidth = Math.min(width, 74);
		return this.fitDialog([
			topBorder(`${SUCCESS_ICON} Changes applied`, boxWidth, this.theme, "success"),
			boxLine(safeText(this.message), boxWidth, this.theme),
			boxLine("", boxWidth, this.theme),
			...detailLines.map((detail) => boxLine(detail === "Next step" || detail === "Errors" ? sectionText(this.theme, detail) : safeText(detail), boxWidth, this.theme)),
			boxLine("", boxWidth, this.theme),
			boxLine(this.theme.fg("warning", "Reload Pi now so extension changes take effect?"), boxWidth, this.theme),
			separator(boxWidth, this.theme),
			this.footerLine([confirmHint(this.keybindings, "reload"), noHint], [cancelHint(this.keybindings, closeLabel)], boxWidth),
			bottomBorder(boxWidth, this.theme),
		], boxWidth);
	}

	private fitDialog(lines: string[], boxWidth: number): string[] {
		const maxRows = overlayRowBudget(this.tui, OVERLAY_OPTIONS);
		if (lines.length <= maxRows) return lines;
		if (maxRows <= 2) return [topBorder("Vipi", boxWidth, this.theme), bottomBorder(boxWidth, this.theme)].slice(0, maxRows);

		const top = lines[0] ?? topBorder("Vipi", boxWidth, this.theme);
		const bottom = lines[lines.length - 1] ?? bottomBorder(boxWidth, this.theme);
		let separatorIndex = -1;
		for (let index = lines.length - 2; index > 0; index--) {
			const plain = safeText(lines[index] ?? "");
			if (plain.startsWith("├") && plain.endsWith("┤")) {
				separatorIndex = index;
				break;
			}
		}

		const footer = separatorIndex > -1 ? lines.slice(separatorIndex, -1) : [];
		const contentRows = Math.max(0, maxRows - 2 - footer.length);
		return [top, ...lines.slice(1, 1 + contentRows), ...footer, bottom].slice(0, maxRows);
	}

	private singleColumnDetailRows({ bodyBudget, width }: { bodyBudget: number; width: number }): string[] {
		if (bodyBudget < 12) return [];
		const includeDescription = bodyBudget >= 20;
		const maxRows = includeDescription ? 8 : 4;
		return ["", ...this.detailLines({ includeDescription, includeHeading: true, width }).slice(0, maxRows)];
	}

	private screenStatus(): string {
		return [
			...(this.hasPendingChanges() ? [this.theme.fg("warning", "Unsaved changes")] : []),
			...(this.message ? [this.styleMessage(this.message)] : []),
		].join(muted(this.theme, " · "));
	}

	private groupedListRows(): VipiListRow[] {
		return this.statuses().map((status) => ({ type: "extension", status }));
	}

	private selectedListRowIndex(rows: readonly VipiListRow[]): number {
		const selected = this.selectedExtension();
		if (!selected) return 0;
		const index = rows.findIndex((row) => row.type === "extension" && row.status.extension.id === selected.id);
		return index === -1 ? 0 : index;
	}

	private renderListRow(row: VipiListRow, width: number, includeDescription: boolean): string {
		return this.renderExtensionRow(row.status, row.status.extension.id === this.selectedExtension()?.id, width, includeDescription);
	}

	private renderExtensionRow(status: VipiExtensionStatus, selected: boolean, width: number, includeDescription: boolean): string {
		const pointer = selected ? this.theme.fg("accent", "▸") : " ";
		const state = status.desired ? this.theme.fg("success", "●") : this.theme.fg("muted", "○");
		const statusWidth = 13;
		const nameWidth = includeDescription ? 22 : Math.min(22, Math.max(0, width - statusWidth - 5));
		const base = `${pointer} ${state} ${padCell(safeText(status.extension.name), nameWidth)} ${padCell(statusLabel(status, this.theme), statusWidth)}`;
		if (!includeDescription) return line(base, width);

		const detail = this.rowDetail(status);
		const descWidth = Math.max(0, width - visibleWidth(base) - 1);
		const description = muted(this.theme, truncateToWidth(detail, descWidth, "…"));
		return line(`${base} ${description}`, width);
	}

	private rowDetail(status: VipiExtensionStatus): string {
		const tags = status.extension.tags?.slice(0, 3).join(", ");
		return safeText(tags || status.extension.description);
	}

	private detailLines(options: { includeDescription: boolean; includeHeading: boolean; width: number }): string[] {
		const extension = this.selectedExtension();
		if (!extension) return [];

		const status = this.selectedStatus();
		const lines = [
			...(options.includeHeading ? [sectionText(this.theme, "Details")] : []),
			safeText(extension.name),
			`Status: ${status ? statusLabel(status, this.theme) : "Unknown"}`,
			muted(this.theme, safeText(extension.source)),
		];

		if (options.includeDescription) {
			lines.push("", sectionText(this.theme, "Description"), ...wrapTextWithAnsi(safeText(extension.description), Math.max(1, options.width - 2)).map(text => muted(this.theme, `  ${text}`)));
		}
		if (extension.extensionDependencies?.length || extension.platformSupport) lines.push("", sectionText(this.theme, "Requirements (not checked)"));
		if (extension.extensionDependencies && extension.extensionDependencies.length > 0) {
			lines.push(`  - Requires extensions: ${safeText(extension.extensionDependencies.join(", "))}`);
		}
		const dependents = directDependentIds(extension.id);
		if (dependents.length > 0) lines.push(`  - Required by: ${safeText(dependents.join(", "))}`);
		lines.push(...platformSupportLines(extension));
		if (extension.notes) {
			lines.push("", sectionText(this.theme, "Notes"), ...wrapTextWithAnsi(safeText(extension.notes), Math.max(1, options.width - 2)).map(text => muted(this.theme, `  ${text}`)));
		}
		return lines;
	}

	private footerLine(leftActions: string[], rightActions: string[], boxWidth: number): string {
		return boxRawLine(keybarLine(leftActions, rightActions, Math.max(0, boxWidth - 2)), boxWidth, this.theme);
	}

	private normalKeybarLeftActions(includePage: boolean): string[] {
		return [
			moveHint(this.keybindings),
			...(includePage ? [pageHint(this.keybindings)] : []),
			confirmHint(this.keybindings, "toggle"),
			"S sync",
			"U update",
			"r refresh",
		];
	}

	private styleMessage(message: string): string {
		const safe = safeText(message);
		const lower = safe.toLowerCase();
		if (lower.includes("failed") || lower.includes("error")) return this.theme.fg("error", safe);
		if (lower.includes("complete") || lower.includes("refreshed") || lower.includes("no pending") || lower.includes("no unsaved")) {
			return this.theme.fg("success", safe);
		}
		if (lower.includes("pending") || lower.includes("reload") || lower.includes("unsaved")) return this.theme.fg("warning", safe);
		return muted(this.theme, safe);
	}

	private statuses(): VipiExtensionStatus[] {
		return getVipiExtensionStatuses(this.draftState, this.configuredSources);
	}

	private selectableExtensions(): readonly VipiExtension[] {
		return vipiExtensions;
	}

	private selectedExtension(): VipiExtension | undefined {
		return this.selectableExtensions()[this.selectedIndex];
	}

	private selectedStatus(): VipiExtensionStatus | undefined {
		const extension = this.selectedExtension();
		if (!extension) return undefined;
		return this.statuses().find((candidate) => candidate.extension.id === extension.id);
	}

	private moveSelection(delta: number): void {
		const count = this.selectableExtensions().length;
		if (count === 0) return;
		this.selectedIndex = clamp(this.selectedIndex + delta, 0, count - 1);
		this.tui.requestRender();
	}

	private pageSelection(delta: number): void {
		const count = this.selectableExtensions().length;
		if (count === 0) return;
		this.selectedIndex = clamp(this.selectedIndex + delta * Math.max(1, this.lastListVisibleRows - 1), 0, count - 1);
		this.tui.requestRender();
	}

	private toggleSelected(): void {
		const extension = this.selectedExtension();
		if (!extension) return;

		const status = this.selectedStatus();
		const enabling = !status?.desired;
		const affectedIds = enabling ? [extension.id, ...dependencyIds(extension.id)] : [extension.id, ...dependentIds(extension.id)];

		for (const id of affectedIds) {
			this.draftState.disabled = enabling
				? removeId(this.draftState.disabled, id)
				: addSorted(this.draftState.disabled, id);
		}

		this.draftState = normalizeVipiState(this.draftState);
		this.message = this.hasPendingChanges()
			? ""
			: "Selection restored.";
		this.tui.requestRender();
	}

	private hasPendingChanges(): boolean {
		return !vipiStatesEqual(this.savedState, this.draftState);
	}

	private closeOrPrompt(): void {
		if (!this.hasPendingChanges()) {
			this.finish({ action: "close" });
			return;
		}

		this.mode = "exit-prompt";
		this.tui.requestRender();
	}

	private handleExitPromptInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.mode = "normal";
			this.tui.requestRender();
			return;
		}
		if (data === "S" || data === "s") {
			void this.apply(false, true);
			return;
		}
		if (data === "D" || data === "d") {
			this.finish({ action: "close" });
		}
	}

	private handleReloadPromptInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			this.finish({ action: "reload" });
			return;
		}

		if (data === "N" || data === "n" || this.keybindings.matches(data, "tui.select.cancel")) {
			if (this.reloadPromptCloseAfterNo) {
				this.finish({ action: "close" });
				return;
			}
			this.mode = "normal";
			this.reloadPromptCloseAfterNo = false;
			this.tui.requestRender();
		}
	}

	private async refreshConfiguredSources(): Promise<void> {
		this.mode = "busy";
		this.message = "Reading Pi package settings...";
		this.operationDetails = ["Progress", "  - Reading Pi extension settings"];
		this.tui.requestRender();

		try {
			this.configuredSources = await getConfiguredVipiSources(this.ctx);
			this.message = "Pi package settings refreshed.";
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.message = `Refresh failed: ${message}`;
		}

		this.operationDetails = [];
		this.mode = "normal";
		this.tui.requestRender();
	}

	private async apply(update: boolean, closeAfterNoReload: boolean): Promise<void> {
		this.mode = "busy";
		this.reloadPromptCloseAfterNo = closeAfterNoReload;
		this.message = update ? "Syncing Vipi extensions before update..." : "Syncing Vipi extensions...";
		this.operationDetails = ["Progress", "  - Saving your extension selection"];
		this.tui.requestRender();

		try {
			const committedState = normalizeVipiState(this.draftState);
			const syncResult = await syncVipiExtensions(this.ctx, committedState, (message) => {
				this.message = message;
				this.operationDetails = ["Progress", `  - ${message}`];
				this.tui.requestRender();
			});

			if (syncResult.errors.some((error) => error.action === "save")) {
				throw new Error(syncResult.errors.map((error) => error.message).join("; "));
			}

			this.savedState = cloneVipiState(committedState);
			this.draftState = cloneVipiState(committedState);
			this.configuredSources = await getConfiguredVipiSources(this.ctx);

			if (update) {
				const updateResult = await updateVipiExtensions(this.ctx, committedState, (message) => {
					this.message = message;
					this.operationDetails = ["Progress", `  - ${message}`];
					this.tui.requestRender();
				});
				this.configuredSources = await getConfiguredVipiSources(this.ctx);
				const hasOperationErrors = syncResult.errors.length > 0 || updateResult.errors.length > 0;
				const changed = syncChanged(syncResult) || updateChanged(updateResult);
				this.message = summarizeUpdate(syncResult, updateResult);
				this.operationDetails = [
					...(hasOperationErrors ? ["Errors"] : ["Next step"]),
					...formatErrorSummary(syncResult.errors).slice(1),
					...formatErrorSummary(updateResult.errors).slice(1),
					...(!hasOperationErrors ? ["  - Reloading Pi automatically"] : []),
				];

				if (changed && !hasOperationErrors) {
					this.finish({ action: "reload" });
					return;
				}
				if (changed) {
					this.mode = "reload-prompt";
				} else if (closeAfterNoReload && !hasOperationErrors) {
					this.finish({ action: "close" });
					return;
				} else {
					this.mode = "normal";
				}
			} else {
				const hasOperationErrors = syncResult.errors.length > 0;
				const changed = syncChanged(syncResult);
				this.message = summarizeSync(syncResult);
				this.operationDetails = hasOperationErrors
					? ["Errors", ...formatErrorSummary(syncResult.errors).slice(1)]
					: ["Next step", "  - Reloading Pi automatically"];

				if (changed && !hasOperationErrors) {
					this.finish({ action: "reload" });
					return;
				}
				if (changed) {
					this.mode = "reload-prompt";
				} else if (closeAfterNoReload && !hasOperationErrors) {
					this.finish({ action: "close" });
					return;
				} else {
					this.mode = "normal";
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.message = `Vipi operation failed: ${message}`;
			this.operationDetails = [];
			this.mode = "normal";
		}

		this.tui.requestRender();
	}

	private finish(result: VipiTuiResult): void {
		this.closed = true;
		this.done(result);
	}
}

function platformSupportLines(extension: VipiExtension): string[] {
	if (!extension.platformSupport) return [];
	return [
		"  - Platforms:",
		...vipiPlatforms.map((platform) => {
			const support = extension.platformSupport?.[platform];
			if (!support) return `    - ${platform}: supported`;
			if (!support.supported) return `    - ${platform}: unsupported (${unsupportedReasonLabel(support.reason)})`;
			const dependencies = support.dependencies?.map(systemDependencyLabel) ?? [];
			return dependencies.length > 0
				? `    - ${platform}: supported; requires ${safeText(dependencies.join(", "))}`
				: `    - ${platform}: supported`;
		}),
	];
}

function systemDependencyLabel(dependency: VipiSystemDependency): string {
	switch (dependency.type) {
		case "binary":
			return dependency.command;
		case "oneOf":
			return dependency.dependencies.map(systemDependencyLabel).join(" or ");
	}
}

function unsupportedReasonLabel(reason: string): string {
	return reason.replaceAll("-", " ");
}

function dependencyIds(id: VipiExtensionId): VipiExtensionId[] {
	const byId = new Map(vipiExtensions.map((extension) => [extension.id, extension]));
	const result = new Set<VipiExtensionId>();
	const visit = (currentId: VipiExtensionId): void => {
		for (const dependencyId of byId.get(currentId)?.extensionDependencies ?? []) {
			if (result.has(dependencyId)) continue;
			result.add(dependencyId);
			visit(dependencyId);
		}
	};
	visit(id);
	return [...result];
}

function directDependentIds(id: VipiExtensionId): VipiExtensionId[] {
	return vipiExtensions.filter((extension) => extension.extensionDependencies?.some((dependencyId) => dependencyId === id)).map((extension) => extension.id);
}

function dependentIds(id: VipiExtensionId): VipiExtensionId[] {
	const result = new Set<VipiExtensionId>();
	const visit = (currentId: VipiExtensionId): void => {
		for (const dependentId of directDependentIds(currentId)) {
			if (result.has(dependentId)) continue;
			result.add(dependentId);
			visit(dependentId);
		}
	};
	visit(id);
	return [...result];
}

function addSorted(values: VipiExtensionId[], id: VipiExtensionId): VipiExtensionId[] {
	return [...new Set([...values, id])].sort((a, b) => a.localeCompare(b));
}

function removeId(values: VipiExtensionId[], id: VipiExtensionId): VipiExtensionId[] {
	return values.filter((value) => value !== id);
}

export async function openVipiTui(ctx: ExtensionCommandContext): Promise<VipiTuiResult> {
	let state: VipiState;
	try {
		state = await readVipiState(getAgentDir());
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const reset = await ctx.ui.confirm("Reset Vipi state?", `${message}\n\nReset to the default Vipi state?`);
		if (!reset) return { action: "close" };
		state = await writeVipiState({ disabled: [] }, getAgentDir());
	}

	const configured = await getConfiguredVipiSources(ctx);
	const result = await ctx.ui.custom<VipiTuiResult>((tui, theme, keybindings, done) => {
		const component = new VipiTuiComponent(ctx, tui, theme, keybindings, done, state, configured);
		return component;
	}, {
		overlay: true,
		overlayOptions: OVERLAY_OPTIONS,
	});

	return result ?? { action: "close" };
}
