import { StrictMode } from "react";
import { Root, createRoot } from "react-dom/client";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { AppContext } from "./context";
import { AssistantChatView } from "./views";
import type VectorLinkPlugin from "../main";

export const VIEW_TYPE_VECTOR_LINK = "vector-link-view";

export default class VectorLinkView extends ItemView {
  root: Root | null = null;
  plugin: VectorLinkPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: VectorLinkPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.icon = "vector-link";
  }

  getViewType() {
    return VIEW_TYPE_VECTOR_LINK;
  }

  getDisplayText() {
    return "VectorLink Assistant";
  }

  async onOpen() {
    this.root = createRoot(this.containerEl.children[1]);
    this.root.render(
      <StrictMode>
        <AppContext.Provider value={{ app: this.app, plugin: this.plugin }}>
          <AssistantChatView />
        </AppContext.Provider>
      </StrictMode>
    );
  }

  async onClose() {
    this.root?.unmount();
  }
}
