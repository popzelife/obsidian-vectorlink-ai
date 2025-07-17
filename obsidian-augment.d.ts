import { MarkdownView, EventRef } from "obsidian";

export type EditorSelectionChange = (
  selection: Selection,
  view: MarkdownView | null
) => void;

export interface WorkspaceEvents {
  on(
    name: "editor-selection-change",
    callback: EditorSelectionChange,
    ctx?: any
  ): EventRef;
  off(name: "editor-selection-change", callback: EditorSelectionChange): void;
  trigger(
    name: "editor-selection-change",
    selection: Selection,
    view: MarkdownView | null
  ): void;
}
