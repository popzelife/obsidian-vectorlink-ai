import {
  TFile,
  EditorSelection,
  FileView,
  WorkspaceLeaf,
  MarkdownView,
} from "obsidian";
import { Icon } from "./Icon";
import { useApp } from "../context";

export type FileWithSelection = TFile & {
  range?: EditorSelection;
  offset?: [number, number];
  selection?: string;
};

export const FileReference = ({
  file,
  title,
  onClick,
  onOpenClick,
  icon,
  appendName = "",
  style = {},
}: {
  file: FileWithSelection;
  onClick?: (file: FileWithSelection) => void;
  onOpenClick?: (
    file: FileWithSelection,
    leaf: WorkspaceLeaf & {
      view: MarkdownView;
    }
  ) => void;
  title?: string;
  appendName?: string;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
}) => {
  const { app } = useApp();

  const openFileInTab = async (
    e: React.MouseEvent<HTMLElement, MouseEvent>
  ) => {
    e.stopPropagation();
    const leaves = app.workspace.getLeavesOfType("markdown");

    // Find the leaf that matches the file path
    let leaf = leaves?.find(
      (l) => l.view instanceof FileView && l.view.file?.path === file.path
    );

    // If no matching leaf, open the file in a new leaf tab
    if (!leaf) {
      leaf = app.workspace.getLeaf("tab");
      if (leaf) {
        leaf.openFile(file);
      }
    }

    await app.workspace.revealLeaf(leaf);

    return leaf as WorkspaceLeaf & {
      view: MarkdownView;
    };
  };

  return (
    <div
      className={`file-reference ${onClick ? "clickable" : ""}`}
      style={{
        ...style,
      }}
      title={title ?? `${file.basename}${appendName}`}
      onClick={(e) => {
        onClick?.(file);
      }}
      role="button"
    >
      <button
        className="clickable-icon"
        style={{
          padding: "4px",
          margin: "-4px 0",
        }}
        title="Open file in tab"
        onClick={(e) => {
          openFileInTab(e).then((leaf) => {
            onOpenClick?.(file, leaf);
          });
        }}
      >
        <Icon name="panel-right-open" />
      </button>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {file.basename}
      </span>
      {appendName && (
        <span
          style={{
            whiteSpace: "nowrap",
            color: "var(--text-muted)",
          }}
        >
          {appendName}
        </span>
      )}
      {icon}
    </div>
  );
};
