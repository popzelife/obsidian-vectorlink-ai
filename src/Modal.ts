import { App, Modal, Setting } from "obsidian";
import { CONVERSATION_PROMPT_ID, MAX_PROMPT_LENGTH } from "./SettingTab";
import type VectorLinkPlugin from "main";

export default class VectorLinkModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    this.setTitle("VectorLink AI Settings");
    this.contentEl.createEl("p", {
      text: "This modal is a placeholder for future settings or information related to VectorLink AI.",
      cls: "vectorlink-modal-description",
      attr: { style: "margin-bottom: 16px;" },
    });
    this.contentEl.createEl("p", {
      text: "You can customize your settings in the plugin's settings tab.",
      cls: "vectorlink-modal-note",
      attr: { style: "color: var(--text-muted);" },
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class NewConversationModal extends Modal {
  constructor(app: App, onSubmit: (result: string) => void) {
    super(app);
    this.setTitle("Enter new conversation name:");

    let name = "";
    new Setting(this.contentEl).setName("Name").addText((text) =>
      text.onChange((value) => {
        name = value;
      })
    );

    new Setting(this.contentEl).addButton((btn) =>
      btn
        .setButtonText("Submit")
        .setCta()
        .onClick(() => {
          this.close();
          onSubmit(name);
        })
    );
  }
}

export class UpdateConversationModal extends Modal {
  plugin: VectorLinkPlugin;
  name: string;
  id: string;
  onSubmit: (name: string, prompt: string) => void;
  prompt: string;
  isLoading = false;

  constructor(
    app: App,
    plugin: VectorLinkPlugin,
    defaultName: string,
    defaultPrompt: string,
    id: string,
    onSubmit: (name: string, prompt: string) => void
  ) {
    super(app);
    this.setTitle("Edit conversation:");
    this.plugin = plugin;

    this.name = defaultName;
    this.prompt = defaultPrompt;
    this.id = id;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    new Setting(this.contentEl)
      .setName("Name")
      .setDesc(
        "Enter a name for the conversation. Default conversation cannot be renamed."
      )
      .addText((text) => {
        text.setValue(this.name);
        text.onChange((value) => {
          this.name = value;
        });
        text.setDisabled(this.id === "default");
        text.inputEl.setAttribute("style", "width: 250px;");
      });

    new Setting(this.contentEl)
      .setName("Prompt Conversation")
      .setDesc(
        `Add a custom prompt for the conversation. (Max ${MAX_PROMPT_LENGTH} characters)`
      )
      .addExtraButton((btn) =>
        btn
          .setIcon(this.isLoading ? "loader" : "sparkles")
          .setTooltip("Generate Prompt with AI")
          .setDisabled(this.isLoading)
          .onClick(async () => {
            this.isLoading = true;
            this.refresh();
            const newPrompt = await this.plugin.generatePrompt(
              {
                ...CONVERSATION_PROMPT_ID,
                variables: {
                  user_language: this.plugin.settings.language,
                  vault_name: this.app.vault.getName(),
                  conversation_name: this.name,
                },
              },
              this.prompt || "",
              [
                {
                  role: "developer",
                  content: `project prompt: ${this.plugin.settings.prompt}`,
                },
              ]
            );
            this.isLoading = false;
            this.refresh();
            if (newPrompt) {
              this.prompt = newPrompt;
              this.refresh();
            }
          })
          .extraSettingsEl.setAttribute("style", "height: 300px;")
      )
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder("Enter your custom prompt here...")
          .setDisabled(this.isLoading)
          .setValue(this.prompt)
          .onChange(async (value) => {
            this.prompt = value;
          })
          .inputEl.setAttribute("style", "width: 250px; height: 300px;");

        textArea.inputEl.setAttribute(
          "maxlength",
          MAX_PROMPT_LENGTH.toString()
        );

        return textArea.inputEl.addEventListener("input", () => {
          if (textArea.inputEl.value.length > MAX_PROMPT_LENGTH) {
            textArea.inputEl.value = textArea.inputEl.value.slice(
              0,
              MAX_PROMPT_LENGTH
            );
          }
        });
      });

    new Setting(this.contentEl).addButton((btn) =>
      btn
        .setButtonText("Submit")
        .setCta()
        .onClick(() => {
          this.close();
          this.onSubmit(this.name, this.prompt);
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  refresh() {
    this.contentEl.empty();
    this.onOpen();
  }
}

export class DeleteConversationModal extends Modal {
  constructor(
    app: App,
    id: string,
    onConfirm: () => void,
    onClear: () => void,
    onCancel?: () => void
  ) {
    super(app);
    this.setTitle("Delete Conversation");

    this.contentEl.createEl("div", {
      text: "Are you sure you want to delete this conversation? This action cannot be undone.",
      attr: { style: "color: var(--text-warning);" },
    });
    this.contentEl.createEl("div", {
      text: "You can also clear the conversation without deleting it.",
      attr: { style: "margin-bottom: 16px;" },
    });

    const buttonContainer = this.contentEl.createDiv();
    buttonContainer.style.display = "flex";
    buttonContainer.style.gap = "8px";
    buttonContainer.style.justifyContent = "flex-end";

    new Setting(buttonContainer)
      .addButton((btn) =>
        btn
          .setButtonText("Delete")
          .setCta()
          .setWarning()
          .setDisabled(id === "default")
          .onClick(() => {
            this.close();
            onConfirm();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Clear").onClick(() => {
          this.close();
          if (onClear) onClear();
        })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.close();
          if (onCancel) onCancel();
        })
      );
  }
}
