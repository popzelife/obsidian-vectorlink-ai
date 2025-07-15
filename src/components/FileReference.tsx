import { TFile, FileView, WorkspaceLeaf, MarkdownView } from "obsidian";
import { Icon } from "./Icon";
import { useApp } from "../context";

export const FileReference = ({
  file,
  title,
  onClick,
  onOpenClick,
  appendName = "",
  style = {},
}: {
  file: TFile;
  onClick?: (file: TFile) => void;
  onOpenClick?: (
    file: TFile,
    leaf: WorkspaceLeaf & {
      view: MarkdownView;
    }
  ) => void;
  title?: string;
  appendName?: string;
  style?: React.CSSProperties;
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
      style={{
        fontSize: 12,
        padding: "0px 8px",
        borderRadius: 20,
        border: "none",
        background: "var(--background-secondary-alt)",
        color: "var(--text-normal)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        ...style,
      }}
      title={title}
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
        onClick={(e) => {
          openFileInTab(e).then((leaf) => {
            onOpenClick?.(file, leaf);
          });
        }}
      >
        <Icon name="panel-right-open" />
      </button>
      <span
        title={`${file.basename}${appendName}`}
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {file.basename}
        {appendName && (
          <span
            style={{
              color: "var(--text-muted)",
            }}
          >
            {appendName}
          </span>
        )}
      </span>
    </div>
  );
};
