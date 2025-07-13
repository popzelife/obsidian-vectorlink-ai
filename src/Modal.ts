import { App, Modal, Setting } from "obsidian";

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
  constructor(
    app: App,
    defaultName: string,
    onSubmit: (result: string) => void
  ) {
    super(app);
    this.setTitle("Update conversation name:");

    let name = defaultName;
    new Setting(this.contentEl).setName("Name").addText((text) => {
      text.setValue(defaultName);
      text.onChange((value) => {
        name = value;
      });
    });

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

export class DeleteConversationModal extends Modal {
  constructor(app: App, onConfirm: () => void, onCancel?: () => void) {
    super(app);
    this.setTitle("Delete Conversation");

    this.contentEl.createEl("div", {
      text: "Are you sure you want to delete this conversation? This action cannot be undone.",
      cls: "delete-conversation-warning",
      attr: { style: "margin-bottom: 16px; color: var(--text-warning);" },
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
          .onClick(() => {
            this.close();
            onConfirm();
          })
      )
      .addExtraButton((btn) =>
        btn
          .setIcon("cross")
          .setTooltip("Cancel")
          .onClick(() => {
            this.close();
            if (onCancel) onCancel();
          })
      );
  }
}
