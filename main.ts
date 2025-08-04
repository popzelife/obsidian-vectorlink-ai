import {
  addIcon,
  Notice,
  Editor,
  WorkspaceLeaf,
  MarkdownView,
  Plugin,
  TFile,
  FileView,
  getIcon,
} from "obsidian";
import OpenAI from "openai";
import {
  ResponseInput,
  ResponsePrompt,
  Tool,
} from "openai/resources/responses/responses";
import { throttle } from "lodash";
import VectorLinkModal from "./src/Modal";
import VectorLinkSettingTab, {
  DEFAULT_SETTINGS,
  PLUGIN_NAME,
  VectorLinkSettings,
} from "./src/SettingTab";
import VectorLinkView, { VIEW_TYPE_VECTOR_LINK } from "./src/View";
import { FileExplorerView } from "obsidian-typings";

export default class VectorLinkPlugin extends Plugin {
  settings: VectorLinkSettings;
  openaiClient: OpenAI | null = null;
  throttleSelectionChangeEvent = throttle(
    this.selectionChangeEvent.bind(this),
    100
  );
  statusBarItemEl: HTMLElement | null = null;
  vectorStoreFiles: OpenAI.VectorStores.Files.VectorStoreFile[] = [];

  async listVectorStoreFiles() {
    if (!this.openaiClient) {
      new Notice(
        `${PLUGIN_NAME}\n❌ OpenAI client not configured. Please set your API key in settings.`
      );
      return;
    }
    if (!this.settings.vectorStoreId) {
      new Notice(`${PLUGIN_NAME}\nVector Store ID not set in settings.`);
      return;
    }

    this.vectorStoreFiles = [];
    let after: string | undefined = undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await this.openaiClient.vectorStores.files.list(
        this.settings.vectorStoreId,
        {
          limit: 100,
          filter: "completed",
          after,
        }
      );
      this.vectorStoreFiles.push(...response.data);
      if (!response.has_more) break;
      after = response.data[response.data.length - 1].id;
    }
  }

  async updateFileExplorerSyncStatus() {
    await this.listVectorStoreFiles();

    const leaves = this.app.workspace.getLeavesOfType("file-explorer");
    if (leaves.length === 0) return;
    const explorer = leaves[0].view as FileExplorerView;

    this.app.vault.getFiles().forEach((file: TFile) => {
      // Find the file's DOM element in the explorer
      const fileItem = explorer.fileItems[file.path];
      if (fileItem && fileItem.file.extension === "md") {
        // Is this file synced with VectorLink?
        const retrievedFile = this.vectorStoreFiles.find(
          (f) => f.attributes?.name === file.path
        );

        // Create or update the sync status element
        let syncEl = fileItem.el.querySelector(".vectorai-sync-status");
        if (!syncEl) {
          syncEl = fileItem.el.createDiv({ cls: "vectorai-sync-status" });
          fileItem.el.insertBefore(syncEl, fileItem.el.children[0]);
        }

        // Update the sync status text according to the file's sync status
        if (
          !retrievedFile ||
          retrievedFile.attributes?.updated_at !== file.stat.mtime
        ) {
          const svg = getIcon("cloud-off")!;
          syncEl.replaceChildren(svg);
        } else {
          const svg = getIcon("cloud")!;
          syncEl.replaceChildren(svg);
        }
      }
    });
  }

  async createFileInVectorStore(file: TFile): Promise<{
    success: boolean;
    data: OpenAI.VectorStores.Files.VectorStoreFile | null;
  }> {
    if (!this.openaiClient || !this.settings.vectorStoreId) {
      return {
        success: false,
        data: null,
      };
    }

    const filePath = file.path;
    const fileStat = await this.app.vault.adapter.stat(filePath);
    const timestamp = fileStat?.mtime || 0;

    const arrayBuffer = await this.app.vault.readBinary(file);
    const blob = new Blob([arrayBuffer]);
    const fileObj = new File([blob], file.name);
    const dataFile = await this.openaiClient.files.create({
      file: fileObj,
      purpose: "user_data",
    });
    const data = await this.openaiClient.vectorStores.files.create(
      this.settings.vectorStoreId,
      {
        file_id: dataFile.id,
        attributes: { updated_at: timestamp, name: filePath },
      }
    );

    if (!data || data.status === "failed") {
      new Notice(`${PLUGIN_NAME}\n❌ Failed to add file: ${filePath}`);
      return {
        success: false,
        data,
      };
    }

    new Notice(`${PLUGIN_NAME}\n✅ Added new file: ${filePath}`);
    return { success: true, data };
  }

  selectionChangeEvent(event: Event) {
    const selection = document.getSelection();
    if (!selection) return;

    // check if parent element is a markdown editor
    const isMarkdownEditor = selection.anchorNode?.parentElement?.closest(
      ".markdown-source-view"
    );

    if (!isMarkdownEditor) return;

    // Retrieve editor and get obsidian selection
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    // Attach the selection to an event
    this.app.workspace.trigger(
      "plugin-editor-selection-change",
      selection,
      activeView
    );
  }

  getActiveEditor() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    return activeView?.editor || null;
  }

  getMarkdownLeaves() {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    const markdownLeaves = leaves.filter(
      (l) => l.view instanceof FileView
    ) as (WorkspaceLeaf & {
      view: FileView;
    })[];

    return markdownLeaves;
  }

  getLeafForFile(file: TFile | null): WorkspaceLeaf | null {
    if (!file) return null;
    const leaves = this.getMarkdownLeaves();
    return leaves.find((l) => l.view.file?.path === file.path) || null;
  }

  async generatePrompt(
    prompt: ResponsePrompt,
    userContent?: string,
    inputs = [] as ResponseInput
  ): Promise<string> {
    if (!this.openaiClient) {
      new Notice(
        `${PLUGIN_NAME}\n❌ OpenAI client not configured. Please set your API key in settings.`
      );
      return "";
    }

    const tools: Tool[] = [];
    if (this.settings.vectorStoreId) {
      tools.push({
        type: "file_search",
        vector_store_ids: [this.settings.vectorStoreId],
        // max_num_results: 20,
      });
    }

    const notice = new Notice(`${PLUGIN_NAME}\nGenerating prompt`, 0);

    try {
      const response = await this.openaiClient.responses.create({
        model: "gpt-4.1",
        prompt,
        tools,
        tool_choice: "auto",
        input: [
          {
            role: "developer",
            content: `user content: ${userContent}`,
          },
          ...inputs,
        ],
      });

      notice.hide();
      new Notice(`${PLUGIN_NAME}\n✅ Prompt generated successfully!`);

      return response.output_text;
    } catch (error) {
      console.error("Error generating prompt:", error);
      notice.hide();
      new Notice(`${PLUGIN_NAME}\n❌ Failed to generate prompt.`);
      return "";
    }
  }

  async syncFilesInVectorStore() {
    if (!this.statusBarItemEl) {
      new Notice(`${PLUGIN_NAME}\n❌ Plugin not initialized.`);
      return;
    }
    if (!this.openaiClient) {
      new Notice(
        `${PLUGIN_NAME}\n❌ OpenAI client not configured. Please set your API key in settings.`
      );
      return;
    }
    if (!this.settings.vectorStoreId) {
      new Notice(`${PLUGIN_NAME}\nVector Store ID not set in settings.`);
      return;
    }
    this.statusBarItemEl.setText("🌌 Syncing ...");
    new Notice(
      `${PLUGIN_NAME}\nSyncing all Markdown files with Vector Store...`
    );
    try {
      // 1. List all local Markdown files
      const vaultFiles = this.app.vault.getFiles();
      const mdFiles = vaultFiles.filter((f) => f.extension === "md");

      // 2. List all files in the vector store
      await this.listVectorStoreFiles();

      // 3. For each local file, upload or update as needed
      const retrievedFiles: Array<{
        path: string;
        storeFile: OpenAI.VectorStores.Files.VectorStoreFile;
      }> = [];
      for (const file of mdFiles) {
        const filePath = file.path;
        const fileStat = await this.app.vault.adapter.stat(filePath);
        const timestamp = fileStat?.mtime || 0;
        const retrievedStoreFile = this.vectorStoreFiles.find(
          (f) => f.attributes && f.attributes.name === filePath
        );
        if (!retrievedStoreFile) {
          // Not in vector store, upload
          const res = await this.createFileInVectorStore(file);
          if (!res.success) continue;
        } else {
          retrievedFiles.push({
            path: filePath,
            storeFile: retrievedStoreFile,
          });
          if (
            retrievedStoreFile.attributes &&
            retrievedStoreFile.attributes.updated_at !== timestamp
          ) {
            // Update file
            const res1 = await this.createFileInVectorStore(file);
            if (!res1.success) continue;

            // Delete old file in vector store
            const res2 = await this.openaiClient.vectorStores.files.delete(
              retrievedStoreFile.id,
              {
                vector_store_id: this.settings.vectorStoreId,
              }
            );
            if (!res2.deleted) {
              new Notice(
                `${PLUGIN_NAME}\n❌ Failed to delete file in vector store: ${filePath}`
              );
            }

            // Delete old file in OpenAI that was linked to the vector store
            const res3 = await this.openaiClient.files.delete(
              retrievedStoreFile.id
            );
            if (!res3.deleted) {
              new Notice(
                `${PLUGIN_NAME}\n❌ Failed to delete file in OpenAI: ${filePath}`
              );
            }
            new Notice(`${PLUGIN_NAME}\nUpdated file: ${filePath}`);
          } else {
            // Already up to date
          }

          this.statusBarItemEl.setText("🌌 Sync VectorLink");
        }
      }

      // 4. Delete files in vector store not present locally
      for (const storeFile of this.vectorStoreFiles) {
        const storeFileName = storeFile.attributes?.name;
        if (
          storeFileName &&
          !retrievedFiles.some((f) => f.path === storeFileName)
        ) {
          // Delete file from vector store
          const res1 = await this.openaiClient.vectorStores.files.delete(
            storeFile.id,
            {
              vector_store_id: this.settings.vectorStoreId,
            }
          );
          if (!res1.deleted) {
            new Notice(
              `${PLUGIN_NAME}\n❌ Failed to delete file in vector store: ${storeFileName}`
            );
            continue;
          }

          // Delete file from OpenAI that was linked to the vector store
          const res2 = await this.openaiClient.files.delete(storeFile.id);
          new Notice(
            `${PLUGIN_NAME}\nDeleted file from vector store: ${storeFileName}`
          );
          if (!res2.deleted) {
            new Notice(
              `${PLUGIN_NAME}\n❌ Failed to delete file in OpenAI: ${storeFileName}`
            );
          }
        }
      }
      new Notice(`${PLUGIN_NAME}\n✅ Sync complete!`);
    } catch (err) {
      new Notice(`${PLUGIN_NAME}\n❌ Sync failed: ${err?.message || err}`);
      console.error(err);
    }

    this.updateFileExplorerSyncStatus();
  }

  async onload() {
    await this.loadSettings();
    this.updateOpenAIClient();

    // Only load this function if view is ready
    this.app.workspace.onLayoutReady(() => {
      this.updateFileExplorerSyncStatus();
    });

    this.registerView(
      VIEW_TYPE_VECTOR_LINK,
      (leaf) => new VectorLinkView(leaf, this)
    );

    document.addEventListener(
      "selectionchange",
      this.throttleSelectionChangeEvent
    );

    addIcon(
      "vector-link",
      `<g stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <!-- Constellation points -->
  <circle cx="20" cy="70" r="3" fill="currentColor" />
  <circle cx="50" cy="20" r="3" fill="currentColor" />
  <circle cx="80" cy="60" r="3" fill="currentColor" />
  <!-- Connecting lines -->
  <line x1="20" y1="70" x2="50" y2="20" />
  <line x1="50" y1="20" x2="80" y2="60" />
  <line x1="20" y1="70" x2="80" y2="60" />
  <!-- Decorative stars (smaller, twinkling points) -->
  <circle cx="30" cy="30" r="1.5" fill="currentColor" />
  <circle cx="70" cy="25" r="1.2" fill="currentColor" />
  <circle cx="60" cy="80" r="1.5" fill="currentColor" />
  <circle cx="40" cy="90" r="1" fill="currentColor" />
</g>`
    );

    // This creates an icon in the left ribbon.
    const ribbonIconEl = this.addRibbonIcon(
      "vector-link",
      "Open VectorLink Assistant",
      (evt: MouseEvent) => {
        this.activateView();
      }
    );
    // Perform additional things with the ribbon
    ribbonIconEl.addClass("my-plugin-ribbon-class");

    // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
    this.statusBarItemEl = this.addStatusBarItem();
    this.statusBarItemEl.setText("🌌 Sync VectorLink");
    this.statusBarItemEl.addClass("mod-clickable");
    this.statusBarItemEl.onClickEvent(this.syncFilesInVectorStore.bind(this));

    this.app.vault.on("rename", (file: TFile, oldPath: string) => {
      // When a file is renamed, we need to update the sync status
      this.updateFileExplorerSyncStatus();
    });
    this.app.vault.on("delete", (file: TFile) => {
      // When a file is deleted, we need to update the sync status
      this.updateFileExplorerSyncStatus();
    });
    this.app.vault.on("create", (file: TFile) => {
      // When a file is created, we need to update the sync status
      this.updateFileExplorerSyncStatus();
    });
    this.app.vault.on("modify", (file: TFile) => {
      // When a file is modified, we need to update the sync status
      this.updateFileExplorerSyncStatus();
    });

    //
    // TODO Handle file events to automatically sync files
    //
    // This registers an event listener for when a new file is created in the vault
    // This is useful for automatically syncing new files to the vector store
    // this.registerEvent(
    //   // Automatically create the file in the vector store
    //   this.app.vault.on("create", async (abstractFile) => {
    //     console.info("File created:", abstractFile);
    //     if (abstractFile.name.endsWith(".md")) {
    //       const file = this.app.vault.getFileByPath(abstractFile.path);

    //       if (file) {
    //         await this.createFileInVectorStore(file);
    //       }
    //     }
    //   })
    // );
    // this.registerEvent(
    //   // Automatically rename the file in the vector store
    //   this.app.vault.on("rename", async (abstractFile, oldPath) => {
    //     console.info("File renamed:", abstractFile, "from", oldPath);
    //     if (abstractFile.name.endsWith(".md")) {
    //       const file = this.app.vault.getFileByPath(abstractFile.path);
    //       if (file) {
    //         await this.createFileInVectorStore(file);
    //       }
    //     }
    //   })
    // );
    // this.registerEvent(
    //   // Automatically modify the file in the vector store
    //   this.app.vault.on("modify", (abstractFile) => {
    //     console.info("File modify:", abstractFile);
    //     if (abstractFile.name.endsWith(".md")) {
    //       const file = this.app.vault.getFileByPath(abstractFile.path);
    //       if (file) {
    //         this.createFileInVectorStore(file);
    //       }
    //     }
    //   })
    // );
    // this.registerEvent(
    //   // Automatically delete the file in the vector store
    //   this.app.vault.on("delete", (abstractFile) => {
    //     console.info("File deleted:", abstractFile);
    //   })
    // );

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: "open-sample-modal-simple",
      name: "Open sample modal (simple)",
      callback: () => {
        new VectorLinkModal(this.app).open();
      },
    });
    // This adds an editor command that can perform some operation on the current editor instance
    this.addCommand({
      id: "sample-editor-command",
      name: "Sample editor command",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        console.log(editor.getSelection());
        editor.replaceSelection("Sample Editor Command");
      },
    });
    // This adds a complex command that can check whether the current state of the app allows execution of the command
    this.addCommand({
      id: "open-sample-modal-complex",
      name: "Open sample modal (complex)",
      checkCallback: (checking: boolean) => {
        // Conditions to check
        const markdownView =
          this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView) {
          // If checking is true, we're simply "checking" if the command can be run.
          // If checking is false, then we want to actually perform the operation.
          if (!checking) {
            new VectorLinkModal(this.app).open();
          }

          // This command will only show up in Command Palette when the check function returns true
          return true;
        }
      },
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new VectorLinkSettingTab(this.app, this));

    // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
    // Using this function will automatically remove the event listener when this plugin is disabled.
    // this.registerDomEvent(document, "click", (evt: MouseEvent) => {
    //   console.log("click", evt);
    // });

    // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
    // this.registerInterval(
    //   window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
    // );
  }

  onunload() {
    // events
    document.removeEventListener(
      "selectionchange",
      this.throttleSelectionChangeEvent
    );

    // remove sync from file explore
    const leaves = this.app.workspace.getLeavesOfType("file-explorer");
    if (leaves.length === 0) return;
    const explorer = leaves[0].view as FileExplorerView;

    this.app.vault.getFiles().forEach((file: TFile) => {
      const fileItem = explorer.fileItems[file.path];
      if (fileItem && fileItem.file.extension === "md") {
        const syncEl = fileItem.el.querySelector(".vectorai-sync-status");
        if (syncEl) {
          syncEl.remove();
        }
      }
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  updateOpenAIClient() {
    if (this.settings.openAiKey) {
      this.openaiClient = new OpenAI({
        apiKey: this.settings.openAiKey,
        organization: this.settings.organizationId,
        project: this.settings.projectId,
        dangerouslyAllowBrowser: true,
      });
    } else {
      this.openaiClient = null;
    }
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_VECTOR_LINK);

    if (leaves.length > 0) {
      // A leaf with our view already exists, use that
      leaf = leaves[0];
    } else {
      // Our view could not be found in the workspace, create a new leaf
      // in the right sidebar for it
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_VECTOR_LINK, active: true });

        // "Reveal" the leaf in case it is in a collapsed sidebar
        workspace.revealLeaf(leaf);
      } else {
        new Notice(`${PLUGIN_NAME}\n❌ Could not create view leaf.`);
      }
    }
  }
}
