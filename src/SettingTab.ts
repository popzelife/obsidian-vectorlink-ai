import { App, PluginSettingTab, Setting } from "obsidian";
import { ResponsePrompt } from "openai/resources/responses/responses";
import type VectorLinkPlugin from "../main";
import {
  NewConversationModal,
  UpdateConversationModal,
  DeleteConversationModal,
} from "./Modal";

export interface ConversationInput {
  id: string;
  name: string;
  lastResponseId: string | null;
  prompt?: string;
}

// List of languages supported by OpenAI
export enum UserLanguage {
  English = "English",
  French = "Français",
  Spanish = "Español",
  German = "Deutsch",
  Italian = "Italiano",
  Portuguese = "Português",
  Chinese = "中文",
  Japanese = "日本語",
  Korean = "한국어",
  Russian = "Русский",
}

export interface VectorLinkSettings {
  openAiKey?: string;
  vectorStoreId?: string;
  organizationId?: string;
  projectId?: string;
  conversations: ConversationInput[];
  selectedConversation: string;
  prompt?: string;
  language: UserLanguage;
}

export const PLUGIN_NAME = "🌌 VectorLink AI Plugin";

export const CHAT_PROMPT_ID: ResponsePrompt = {
  id: "pmpt_687504553a608197ac374e6c850a400c07bf6ae19ef1a3f8",
  version: "2",
};

export const PROJECT_PROMPT_ID: ResponsePrompt = {
  id: "pmpt_687504fcd6ac81978c797263fb42a15c004d67a073e26a82",
  version: "3",
};

export const CONVERSATION_PROMPT_ID: ResponsePrompt = {
  id: "pmpt_6875129079148193928f5b0d9deb4005055b8d72d7d49abf",
  version: "3",
};

// Limit for prompt length
export const MAX_PROMPT_LENGTH = 120000;

export const DEFAULT_SETTINGS: VectorLinkSettings = {
  conversations: [
    {
      id: "default",
      name: "Default",
      lastResponseId: null,
    },
  ],
  selectedConversation: "default",
  language: UserLanguage.English,
};

export default class VectorLinkSettingTab extends PluginSettingTab {
  plugin: VectorLinkPlugin;
  selectedConversation: string;
  isLoadingConversationPrompt = false;
  isLoadingGlobalPrompt = false;

  constructor(app: App, plugin: VectorLinkPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.selectedConversation = this.plugin.settings.conversations[0].id;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("OpenAI API Key")
      .setDesc("Enter your OpenAI API key to enable AI features.")
      .addText((text) =>
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.openAiKey || "")
          .onChange(async (value) => {
            this.plugin.settings.openAiKey = value;
            await this.plugin.saveSettings();
            this.plugin.updateOpenAIClient();
          })
          .inputEl.setAttribute("style", "width: 300px;")
      );

    new Setting(containerEl)
      .setName("Vector Store ID")
      .setDesc("Enter your OpenAI vector store ID to enable vector search.")
      .addText((text) =>
        text
          .setPlaceholder("store-...")
          .setValue(this.plugin.settings.vectorStoreId || "")
          .onChange(async (value) => {
            this.plugin.settings.vectorStoreId = value;
            await this.plugin.saveSettings();
          })
          .inputEl.setAttribute("style", "width: 300px;")
      );

    new Setting(containerEl)
      .setName("Organization ID")
      .setDesc("Enter your OpenAI organization ID for multi-tenant support.")
      .addText((text) =>
        text
          .setPlaceholder("org-...")
          .setValue(this.plugin.settings.organizationId || "")
          .onChange(async (value) => {
            this.plugin.settings.organizationId = value;
            await this.plugin.saveSettings();
            this.plugin.updateOpenAIClient();
          })
          .inputEl.setAttribute("style", "width: 300px;")
      );

    new Setting(containerEl)
      .setName("Project ID")
      .setDesc("Enter your OpenAI project ID for project-specific settings.")
      .addText((text) =>
        text
          .setPlaceholder("project-...")
          .setValue(this.plugin.settings.projectId || "")
          .onChange(async (value) => {
            this.plugin.settings.projectId = value;
            await this.plugin.saveSettings();
            this.plugin.updateOpenAIClient();
          })
          .inputEl.setAttribute("style", "width: 300px;")
      );

    new Setting(containerEl)
      .setName("Language")
      .setDesc("Select the language for AI responses.")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions(
            Object.fromEntries(
              Object.entries(UserLanguage).map(([key, value]) => [key, value])
            )
          )
          .setValue(this.plugin.settings.language || UserLanguage.English)
          .onChange(async (value) => {
            this.plugin.settings.language = value as UserLanguage;
            await this.plugin.saveSettings();
          })
          .selectEl.setAttribute("style", "width: 300px;");
      });

    new Setting(containerEl)
      .setName("Global Prompt Template")
      .setDesc(
        `Customize the global prompt for AI responses. (Max ${MAX_PROMPT_LENGTH} characters)`
      )
      .addExtraButton((btn) =>
        btn
          .setIcon("sparkles")
          .setTooltip("Generate Prompt with AI")
          .setDisabled(this.isLoadingGlobalPrompt)
          .onClick(async () => {
            this.isLoadingGlobalPrompt = true;
            this.display(); // Refresh settings tab to show loading state
            const prompt = await this.plugin.generatePrompt(
              {
                ...PROJECT_PROMPT_ID,
                variables: {
                  user_language: this.plugin.settings.language,
                  vault_name: this.app.vault.getName(),
                },
              },
              this.plugin.settings.prompt
            );
            this.isLoadingGlobalPrompt = false;
            this.display(); // Refresh settings tab to hide loading state
            if (prompt) {
              this.plugin.settings.prompt = prompt;
              await this.plugin.saveSettings();
              this.display(); // Refresh settings tab
            }
          })
          .extraSettingsEl.setAttribute("style", "height: 300px;")
      )
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder("Enter your custom prompt here...")
          .setValue(this.plugin.settings.prompt || "")
          .setDisabled(this.isLoadingGlobalPrompt)
          .onChange(async (value) => {
            this.plugin.settings.prompt = value;
            await this.plugin.saveSettings();
          })
          .inputEl.setAttribute("style", "width: 450px; height: 300px;");

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

    // Add a divider for better organization
    containerEl.createEl("hr");
    // Conversation management section - Add title and description
    containerEl.createEl("h2", {
      text: "Conversation Management",
      cls: "vectorlink-conversation-title",
      attr: { style: "margin-top: 20px;" },
    });
    containerEl.createEl("p", {
      text: "Manage your AI conversations, including creating, editing, and deleting conversations.",
      cls: "vectorlink-conversation-description",
      attr: { style: "margin-bottom: 16px; color: var(--text-muted);" },
    });

    new Setting(containerEl)
      .setName("Conversations")
      .setDesc("Manage your AI conversations.")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions(
            this.plugin.settings.conversations.reduce<Record<string, string>>(
              (acc, conv) => {
                acc[conv.id] = conv.name;
                return acc;
              },
              { default: "Default" }
            )
          )
          .setValue(this.selectedConversation)
          .onChange(async (value) => {
            this.selectedConversation = value;
            await this.plugin.saveSettings();
            this.display(); // Refresh settings tab
          })
          .selectEl.setAttribute("style", "width: 300px;");
      })
      .addButton((button) =>
        button
          .setTooltip("Delete Conversation")
          .setDisabled(this.selectedConversation === "default")
          .setIcon("trash")
          .setWarning()
          .onClick(() => {
            new DeleteConversationModal(this.app, async () => {
              this.plugin.settings.conversations =
                this.plugin.settings.conversations.filter(
                  (conv) => conv.id !== this.selectedConversation
                );
              this.selectedConversation = "default";
              await this.plugin.saveSettings();
              this.display(); // Refresh settings tab
            }).open();
          })
      )
      .addButton((button) =>
        button
          .setTooltip("Edit Conversation")
          .setIcon("pencil")
          .onClick(() => {
            const index = this.plugin.settings.conversations.findIndex(
              (conv) => conv.id === this.selectedConversation
            );
            if (index !== -1) {
              new UpdateConversationModal(
                this.app,
                this.plugin,
                this.plugin.settings.conversations[index].name,
                this.plugin.settings.conversations[index].prompt || "",
                this.plugin.settings.conversations[index].id,
                async (name, prompt) => {
                  this.plugin.settings.conversations[index].name = name;
                  this.plugin.settings.conversations[index].prompt = prompt;
                  await this.plugin.saveSettings();
                  this.display(); // Refresh settings tab
                }
              ).open();
            }
          })
      )
      .addButton((button) =>
        button
          .setTooltip("New Conversation")
          .setIcon("message-square-plus")
          .setCta()
          .onClick(() => {
            new NewConversationModal(this.app, async (name) => {
              const newConv: ConversationInput = {
                id: `conv-${Date.now()}`,
                name,
                lastResponseId: null,
              };
              this.plugin.settings.conversations.push(newConv);
              this.selectedConversation = newConv.id;
              await this.plugin.saveSettings();
              this.display(); // Refresh settings tab
            }).open();
          })
      );

    new Setting(containerEl)
      .setName("Prompt Conversation")
      .setDesc(
        `Add a custom prompt for the conversation. (Max ${MAX_PROMPT_LENGTH} characters)`
      )
      .addExtraButton((btn) =>
        btn
          .setIcon(this.isLoadingConversationPrompt ? "loader" : "sparkles")
          .setTooltip("Generate Prompt with AI")
          .setDisabled(this.isLoadingConversationPrompt)
          .onClick(async () => {
            const index = this.plugin.settings.conversations.findIndex(
              (conv) => conv.id === this.selectedConversation
            );

            if (index !== -1) {
              this.isLoadingConversationPrompt = true;
              this.display(); // Refresh settings tab to show loading state
              const prompt = await this.plugin.generatePrompt(
                {
                  ...CONVERSATION_PROMPT_ID,
                  variables: {
                    user_language: this.plugin.settings.language,
                    vault_name: this.app.vault.getName(),
                    conversation_name:
                      this.plugin.settings.conversations[index].name,
                  },
                },
                this.plugin.settings.conversations[index].prompt || "",
                [
                  {
                    role: "developer",
                    content: `project prompt: ${this.plugin.settings.prompt}`,
                  },
                ]
              );
              this.isLoadingConversationPrompt = false;
              this.display(); // Refresh settings tab to hide loading state
              if (prompt) {
                this.plugin.settings.conversations[index].prompt = prompt;

                await this.plugin.saveSettings();
                this.display(); // Refresh settings tab
              }
            }
          })
          .extraSettingsEl.setAttribute("style", "height: 300px;")
      )
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder("Enter your custom prompt here...")
          .setValue(
            this.plugin.settings.conversations.find(
              (conv) => conv.id === this.selectedConversation
            )?.prompt || ""
          )
          .setDisabled(this.isLoadingConversationPrompt)
          .onChange(async (value) => {
            const index = this.plugin.settings.conversations.findIndex(
              (conv) => conv.id === this.selectedConversation
            );
            if (index !== -1) {
              this.plugin.settings.conversations[index].prompt = value;
            }
            await this.plugin.saveSettings();
          })
          .inputEl.setAttribute("style", "width: 450px; height: 300px;");

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
  }
}
