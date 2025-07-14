import { StrictMode, useRef, useState, useContext, useEffect } from "react";
import { Root, createRoot } from "react-dom/client";
import {
  ItemView,
  WorkspaceLeaf,
  Notice,
  getIcon,
  MarkdownRenderer,
} from "obsidian";
import {
  Tool,
  ResponseInputMessageItem,
} from "openai/resources/responses/responses";
import TextareaAutosize from "react-textarea-autosize";
import { AppContext } from "./context";
import { PLUGIN_NAME, CHAT_PROMPT_ID } from "./SettingTab";
import {
  NewConversationModal,
  DeleteConversationModal,
  UpdateConversationModal,
} from "./Modal";
import type VectorLinkPlugin from "../main";

export const VIEW_TYPE_VECTOR_LINK = "vector-link-view";

export interface ResponseItem {
  type: "response_item" | "input_item";
  role: "user" | "assistant" | "system" | "developer";
  content: string;
  previous_response_id?: string | null;
}

const MarkdownDecorator = ({
  content,
  style,
}: {
  content: string;
  style?: React.CSSProperties;
}) => {
  const context = useContext(AppContext);
  const app = context?.app;
  const plugin = context?.plugin;

  if (!app || !plugin) {
    return PluginNotInitialized();
  }

  const mdRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mdRef.current) {
      mdRef.current.empty();
      MarkdownRenderer.render(app, content, mdRef.current, "", plugin);
    }
    return () => {
      if (mdRef.current) {
        mdRef.current.empty();
      }
    };
  }, [content, app, plugin]);

  return <div className="markdown-decorator" ref={mdRef} style={style} />;
};

const MessageBubble = ({ item }: { item: ResponseItem }) => {
  const [hover, setHover] = useState(false);

  // Helper: extract :::gpt-markdown blocks
  const parseGptMarkdown = (content: string) => {
    const regex = /:::gpt-markdown[\r\n]+([\s\S]*?)\n?:::/g;
    let lastIndex = 0;
    const result: Array<{ type: "markdown" | "text"; value: string }> = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        result.push({
          type: "text",
          value: content.slice(lastIndex, match.index),
        });
      }
      result.push({ type: "markdown", value: match[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      result.push({ type: "text", value: content.slice(lastIndex) });
    }
    return result;
  };

  const parsed =
    item.role === "assistant" ? parseGptMarkdown(item.content) : null;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        margin: "8px 0",
        textAlign: item.role === "user" ? "right" : "left",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: item.role !== "user" ? "start" : "end",
      }}
    >
      <div
        style={{
          display: "inline-block",
          background:
            item.role === "user"
              ? "var(--interactive-accent)"
              : "var(--background-modifier-box-highlight)",
          color: item.role === "user" ? "#fff" : "inherit",
          borderRadius: 8,
          padding: "8px 12px",
          maxWidth: "80%",
          wordBreak: "break-word",
          position: "relative",
          userSelect: "text",
          // @ts-ignore
          "--text-selection":
            item.role === "user"
              ? "var(--interactive-hover)"
              : "var(--color-accent)",
        }}
      >
        {item.role === "assistant" && parsed
          ? parsed.map((block, i) =>
              block.type === "markdown" ? (
                <div
                  key={i}
                  style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: 6,
                    margin: "8px 0",
                    fontFamily: "var(--font-monospace)",
                    position: "relative",
                    backgroundColor: "var(-background-primary)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      padding: "8px",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: "var(--dropdown-background)",
                      borderBottom:
                        "1px solid var(--nav-item-background-active)",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: "bold",
                        fontSize: 13,
                        marginRight: 8,
                      }}
                    >
                      Markdown
                    </span>
                    <button
                      type="button"
                      aria-label="Copy markdown"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-faint)",
                        fontSize: 14,
                        cursor: "pointer",
                        padding: " 2px 6px",
                      }}
                      onClick={() => navigator.clipboard.writeText(block.value)}
                      title="Copy markdown"
                    >
                      <span
                        dangerouslySetInnerHTML={{
                          __html: getIcon("clipboard-copy")?.outerHTML || "",
                        }}
                        style={{
                          display: "inline-flex",
                          verticalAlign: "middle",
                        }}
                      />
                    </button>
                  </div>
                  <MarkdownDecorator
                    content={block.value}
                    style={{
                      padding: "0 8px",
                    }}
                  />
                </div>
              ) : (
                <MarkdownDecorator key={i} content={block.value} />
              )
            )
          : item.content}
      </div>
      <button
        type="button"
        aria-label="Copy message"
        style={{
          width: "fit-content",
          background: "none",
          border: "none",
          color: "var(--text-faint)",
          cursor: "pointer",
          fontSize: 14,
          verticalAlign: "middle",
          boxShadow: "none",
          padding: "5px",
          opacity: hover ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}
        onClick={() => {
          navigator.clipboard.writeText(item.content);
        }}
        title="Copy to clipboard"
      >
        <span
          dangerouslySetInnerHTML={{
            __html: getIcon("clipboard-copy")?.outerHTML || "",
          }}
          style={{ display: "inline-flex", verticalAlign: "middle" }}
        />
      </button>
    </div>
  );
};

const VectorLinkReactView = () => {
  const context = useContext(AppContext);
  const plugin = context?.plugin;

  if (!plugin) {
    throw PluginNotInitialized();
  }

  const [messages, setMessages] = useState<ResponseItem[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Track the latest requested conversation ID to avoid race conditions
  const latestConversationId = useRef<string | null>(null);

  const loading = loadingHistory || thinking;

  // Load previous conversation items (optional, can be triggered by a button)
  const loadHistory = async () => {
    if (!plugin.openaiClient) return;

    const selectedConversationId = plugin.settings.selectedConversation;
    latestConversationId.current = selectedConversationId;
    const selectedConversation = plugin.settings.conversations.find(
      (e) => e.id === selectedConversationId
    );
    if (!selectedConversation) return;

    setLoadingHistory(true);
    const list: ResponseItem[] = [];
    try {
      let previousResponseId: string | null =
        selectedConversation.lastResponseId;
      while (previousResponseId) {
        // Fetch the response by ID
        const response = await plugin.openaiClient.responses.retrieve(
          previousResponseId,
          {
            include: ["file_search_call.results"],
            stream: false,
          }
        );
        const outputMsg = response.output.find((o) => o.type === "message");
        list.push({
          content: response.output_text,
          role: outputMsg?.role || "assistant",
          type: "response_item",
          previous_response_id: response.previous_response_id || null,
        });

        // Fetch the input by response ID
        const input = await plugin.openaiClient.responses.inputItems.list(
          previousResponseId
        );
        const inputMsg = input.data.find(
          (i) => i.type === "message" && i.role === "user"
        ) as ResponseInputMessageItem;
        list.push({
          content:
            inputMsg?.content.find((c) => c.type === "input_text")?.text || "",
          role: inputMsg?.role || "user",
          type: "input_item",
        });

        // Update the previous response ID for the next iteration
        previousResponseId = response.previous_response_id || null;
      }
    } catch (err) {
      new Notice(`${PLUGIN_NAME}\n❌ Failed to load conversation history`);
      console.error("Failed to load history:", err);
    }

    // Only update state if this is still the latest requested conversation
    if (latestConversationId.current === selectedConversationId) {
      setMessages(list.reverse());
      setLoadingHistory(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !plugin.openaiClient) return;

    const index = plugin.settings.conversations.findIndex(
      (e) => e.id === plugin.settings.selectedConversation
    );
    if (index === -1) {
      new Notice(`${PLUGIN_NAME}\n❌ Selected conversation not found`);
      return;
    }

    const userMessage: ResponseItem = {
      role: "user",
      content: input,
      type: "input_item",
    };
    const lastResponseId = plugin.settings.conversations[index]?.lastResponseId;
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setThinking(true);

    try {
      // Use the OpenAI responses API with file tool and vector store
      // See: https://platform.openai.com/docs/api-reference/responses
      // We'll use the "file_search" tool with the vector store if available
      const tools: Tool[] = [];
      if (plugin.settings.vectorStoreId) {
        tools.push({
          type: "file_search",
          vector_store_ids: [plugin.settings.vectorStoreId],
          // max_num_results: 20,
        });
      }

      // Always prepend system prompt for now (could be optimized to only do it once per conversation)
      const inputMessages = [userMessage].map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await plugin.openaiClient.responses.create({
        model: "gpt-4.1",
        prompt: {
          ...CHAT_PROMPT_ID,
          variables: {
            user_language: plugin.settings.language,
            general_prompt: plugin.settings.prompt || "",
            specific_prompt: plugin.settings.conversations[index].prompt || "",
          },
        },
        input: inputMessages,
        tools,
        tool_choice: tools.length > 0 ? "required" : undefined,
        include: ["file_search_call.results"],
        stream: false,
        store: true,
        previous_response_id: lastResponseId || undefined,
      });

      // Handle tool calls and assistant response
      let assistantMessage = "";
      if (response.output_text) {
        assistantMessage = response.output_text;
      } else {
        assistantMessage = "[No response]";
      }

      //
      // TODO Format the tool assistant message
      //
      // If there are tool calls, we can handle them here
      // if (response.output && response.output.length > 0) {
      //   for (const toolCall of response.output) {
      //     if (toolCall.type === "file_search_call") {
      //       // Handle file search results
      //       const results = toolCall.results || [];
      //       if (results.length > 0) {
      //         assistantMessage += "\n\n**File Search Results:**\n";
      //         for (const result of results) {
      //           assistantMessage += `- **File:** ${result.filename} (Score: ${result.score})\n`;
      //           // assistantMessage += `  - **Content:** ${result.text}\n`;
      //         }
      //       } else {
      //         assistantMessage +=
      //           "\n\n**File Search Results:** No results found.";
      //       }
      //     }
      //   }
      // }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantMessage,
          type: "response_item",
          previous_response_id: response.previous_response_id || null,
        },
      ]);

      // Update the last response ID in settings
      if (index !== -1) {
        plugin.settings.conversations[index].lastResponseId = response.id;
        plugin.saveSettings();
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Error: " + (err?.message || err),
          type: "response_item",
          previous_response_id: lastResponseId || null,
        },
      ]);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  };

  const addNewConversation = async (name: string) => {
    const newId = `conv-${Date.now()}`;
    const newConversation = {
      id: newId,
      name,
      lastResponseId: null,
    };

    plugin.settings.conversations.push(newConversation);
    plugin.settings.selectedConversation = newId;
    plugin.saveSettings();
    await loadHistory();
  };

  const updateConversation = async (newName: string, newPrompt: string) => {
    const index = plugin.settings.conversations.findIndex(
      (e) => e.id === plugin.settings.selectedConversation
    );
    if (index !== -1) {
      plugin.settings.conversations[index].name = newName;
      plugin.settings.conversations[index].prompt = newPrompt;
      plugin.saveSettings();
      // Simple hack to update the messages state to reflect the new name
      setMessages((prev) => prev);
    }
  };

  const deleteConversation = async (id: string) => {
    if (id === "default") {
      new Notice(`${PLUGIN_NAME}\nCannot delete the default conversation`);
      return;
    }

    const index = plugin.settings.conversations.findIndex((e) => e.id === id);
    if (index !== -1) {
      plugin.settings.conversations.splice(index, 1);
      plugin.settings.selectedConversation =
        plugin.settings.conversations.length > 0
          ? plugin.settings.conversations[0].id
          : "default";
      plugin.saveSettings();
      await loadHistory();
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          justifyContent: "space-between",
          padding: "8px",
          borderBottom: "1px solid var(--background-modifier-border)",
          background: "var(--background-primary)",
        }}
      >
        <select
          value={plugin.settings.selectedConversation}
          onChange={async (e) => {
            plugin.settings.selectedConversation = e.target.value;
            plugin.saveSettings();
            await loadHistory();
          }}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            minWidth: 180,
            width: "100%",
          }}
        >
          {plugin.settings.conversations.map((conv) => (
            <option key={conv.id} value={conv.id}>
              {conv.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            new DeleteConversationModal(context.app, () => {
              deleteConversation(plugin.settings.selectedConversation);
            }).open();
          }}
          disabled={plugin.settings.selectedConversation === "default"}
          title="Delete Conversation"
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "none",
            background: "var(--background-modifier-accent)",
            color: "var(--text-normal)",
          }}
        >
          <span
            dangerouslySetInnerHTML={{
              __html: getIcon("trash")?.outerHTML || "",
            }}
            style={{ display: "inline-flex", verticalAlign: "middle" }}
          />
        </button>
        <button
          onClick={() => {
            const conv = plugin.settings.conversations.find(
              (e) => e.id === plugin.settings.selectedConversation
            );
            if (!conv) {
              new Notice(`${PLUGIN_NAME}\n❌ Conversation not found`);
              return;
            }
            new UpdateConversationModal(
              context.app,
              context.plugin,
              conv.name,
              conv.prompt || "",
              conv.id,
              (newName, newPrompt) => {
                updateConversation(newName, newPrompt);
              }
            ).open();
          }}
          title="Edit Conversation"
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "none",
            background: "var(--background-modifier-accent)",
            color: "var(--text-normal)",
          }}
        >
          <span
            dangerouslySetInnerHTML={{
              __html: getIcon("pencil")?.outerHTML || "",
            }}
            style={{ display: "inline-flex", verticalAlign: "middle" }}
          />
        </button>
        <button
          onClick={() => {
            new NewConversationModal(context.app, (name) => {
              if (name) addNewConversation(name);
            }).open();
          }}
          title="New Conversation"
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "none",
          }}
        >
          <span
            dangerouslySetInnerHTML={{
              __html: getIcon("message-square-plus")?.outerHTML || "",
            }}
            style={{ display: "inline-flex", verticalAlign: "middle" }}
          />
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 8,
          background: "var(--background-secondary)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {loadingHistory ? (
          <div style={{ textAlign: "center", color: "var(--text-faint)" }}>
            Loading history...
          </div>
        ) : (
          <>
            {messages.length === 0 && (
              <div
                style={{
                  color: "var(--text-faint)",
                  textAlign: "center",
                  marginTop: 32,
                }}
              >
                Ask anything about your notes or knowledge base!
              </div>
            )}
            {messages.map((msg, i) => (
              <MessageBubble key={i} item={msg} />
            ))}
            {thinking && (
              <div
                style={{
                  color: "var(--text-faint)",
                  textAlign: "center",
                  margin: 8,
                }}
              >
                Thinking...
              </div>
            )}
          </>
        )}
      </div>
      <form
        style={{
          display: "flex",
          borderTop: "1px solid var(--background-modifier-border)",
          padding: 8,
        }}
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
      >
        <TextareaAutosize
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message to VectorLink Assistant..."
          maxRows={15}
          style={{
            flex: 1,
            marginRight: 8,
            padding: 8,
            borderRadius: 6,
            border: "1px solid var(--background-modifier-border)",
            resize: "none",
          }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{ padding: "8px 16px", borderRadius: 6, height: "100%" }}
        >
          Send
        </button>
      </form>
    </div>
  );
};

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
          <VectorLinkReactView />
        </AppContext.Provider>
      </StrictMode>
    );
  }

  async onClose() {
    this.root?.unmount();
  }
}

const PluginNotInitialized = () => {
  return (
    <div style={{ padding: 16, color: "var(--text-faint)" }}>
      ❌ Plugin not initialized. Please check your settings.
    </div>
  );
};
