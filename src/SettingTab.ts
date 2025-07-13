import { App, PluginSettingTab, Setting } from "obsidian";
import type VectorLinkPlugin from "../main";
import type { ResponseItem } from "./View";

export interface ConversationInput {
  id: string;
  name: string;
  lastResponseId: string | null;
}

export interface VectorLinkSettings {
  openAiKey?: string;
  vectorStoreId?: string;
  organizationId?: string;
  projectId?: string;
  conversations: ConversationInput[];
  selectedConversation: string;
}

export const PLUGIN_NAME = "🌌 VectorLink AI Plugin";

// System prompt for markdown decorator
export const SYSTEM_PROMPT: ResponseItem = {
  role: "system",
  content: `You are a helpful assistant that searches for information in vector files and writes or updates content based on the files you have referenced.

When providing answers that include markdown content, always wrap the markdown section between :::gpt-markdown and ::: blocks, as shown:
:::gpt-markdown
[Insert your markdown content here]
:::

- Use your internal search and reasoning to find relevant information from the available vector files before generating or updating any content.
- When necessary, wxplain your reasoning, including which files or sections you referenced, before presenting your final content.
- Persist through multiple searches or reasoning steps if needed to ensure your answer is comprehensive and accurate.
- If the user asks to update content, explain the logic behind your changes, noting which references supported each update.
- Always respond in the user's language and vector files language, maintaining clarity and relevance to the context.

Output Format:
- For any generated markdown, enclose it in :::gpt-markdown and ::: blocks as specified.
- Present your answer as follows:
  1. Reasoning: Detail which vector files or sections you referenced and the logic behind your answer.
  2. Markdown Content: Enclosed in :::gpt-markdown and ::: blocks (if applicable).

Example 1:
Input: "Summarize the main points from file X."
Output:
Reasoning: I searched vector file X for mentions of primary arguments and supporting details. Sections A and B emphasized [points].
:::gpt-markdown
- Main point 1
- Main point 2
:::

(Real examples may be longer and more detailed, using actual section names and content from files.)

Remember: Always present your reasoning before any markdown content or conclusions, and wrap all markdown answers appropriately.

Important: The main tasks are (1) search in vector files, (2) generate or update content based on those files, and (3) always wrap markdown in :::gpt-markdown...:::, presenting reasoning first and the answer last.
Always respond in user language.`,
  type: "input_item",
};

export const DEFAULT_SETTINGS: VectorLinkSettings = {
  conversations: [
    {
      id: "default",
      name: "Default",
      lastResponseId: null,
    },
  ],
  selectedConversation: "default",
};

export default class VectorLinkSettingTab extends PluginSettingTab {
  plugin: VectorLinkPlugin;

  constructor(app: App, plugin: VectorLinkPlugin) {
    super(app, plugin);
    this.plugin = plugin;
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
      );
  }
}
