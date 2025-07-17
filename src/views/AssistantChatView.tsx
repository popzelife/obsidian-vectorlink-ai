import { useRef, useState, useEffect } from "react";
import { EditorSelection, Notice } from "obsidian";
import { Tool } from "openai/resources/responses/responses";
import TextareaAutosize from "react-textarea-autosize";
import { EditorSelectionChange } from "obsidian-augment";
import { useApp } from "../context";
import { PLUGIN_NAME, CHAT_PROMPT_ID } from "../SettingTab";
import {
  NewConversationModal,
  DeleteConversationModal,
  UpdateConversationModal,
} from "../Modal";
import {
  Icon,
  MessageBubble,
  FileReference,
  FileWithSelection,
} from "../components";
import type { ResponseItem } from "../types";

export const AssistantChatView = () => {
  const { plugin, app } = useApp();

  const [suggestedFile, setSuggestedFile] = useState<FileWithSelection | null>(
    app.workspace.getActiveFile()
  );

  const [contextFiles, setContextFiles] = useState<FileWithSelection[]>([]);

  const [messages, setMessages] = useState<Map<string, ResponseItem>>(
    new Map<string, ResponseItem>()
  );
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Track the latest requested conversation ID to avoid race conditions
  const latestConversationId = useRef<string | null>(null);

  useEffect(() => {
    const eventFileOpen = app.workspace.on("file-open", (file) => {
      if (!file || file.extension !== "md") {
        setSuggestedFile(null);
        return;
      }
      setSuggestedFile(file);
    });

    return () => {
      app.workspace.offref(eventFileOpen);
    };
  }, []);

  const prevSelectionRef = useRef<EditorSelection | undefined>(undefined);

  useEffect(() => {
    const onEditorSelectionChange: EditorSelectionChange = (
      selection,
      view
    ) => {
      const range = view?.editor.listSelections()?.[0];
      // Only update if selection actually changed
      if (
        !prevSelectionRef.current ||
        JSON.stringify(prevSelectionRef.current) !== JSON.stringify(range)
      ) {
        setSuggestedFile((prev) => {
          if (!range) return prev;
          if (prev) {
            return {
              ...prev,
              range,
              selection:
                view?.editor.getRange(range.anchor, range.head) ||
                view?.editor.getRange(range.head, range.anchor),
              offset: [
                view?.editor.posToOffset(range.anchor),
                view?.editor.posToOffset(range.head),
              ].sort((a, b) => a - b) as [number, number],
            };
          }
          return prev;
        });
        prevSelectionRef.current = range;
      }
    };

    const offSelection = app.workspace.on(
      // @ts-ignore
      "plugin-editor-selection-change",
      onEditorSelectionChange
    );

    return () => {
      app.workspace.offref(offSelection);
    };
  }, []);

  // Load previous conversation items
  // Use an AbortController to cancel previous loadHistory calls
  const loadHistoryAbortController = useRef<AbortController | null>(null);

  const loadHistory = async () => {
    if (!plugin.openaiClient) return;
    console.info("Loading conversation history...");

    // Abort any previous loadHistory in progress
    if (loadHistoryAbortController.current) {
      loadHistoryAbortController.current.abort();
    }
    const abortController = new AbortController();
    loadHistoryAbortController.current = abortController;

    // If the latest conversation ID has changed, reset messages
    if (latestConversationId.current !== plugin.settings.selectedConversation) {
      setMessages(new Map<string, ResponseItem>());
    }
    const selectedConversationId = plugin.settings.selectedConversation;
    latestConversationId.current = selectedConversationId;

    // If no conversation is selected, do nothing
    const selectedConversation = plugin.settings.conversations.find(
      (e) => e.id === selectedConversationId
    );
    if (!selectedConversation) return;

    // Start loading history messages
    setLoadingHistory(true);
    try {
      let previousResponseId: string | null =
        selectedConversation.lastResponseId;
      let count = 0;
      const MAX_HISTORY = 20; // Limit to 20 message pairs

      while (previousResponseId && count < MAX_HISTORY) {
        // Check for abort signal
        if (abortController.signal.aborted) break;

        // Fetch response and input in parallel
        const [response, input] = await Promise.all([
          plugin.openaiClient.responses.retrieve(previousResponseId, {
            include: ["file_search_call.results"],
            stream: false,
          }),
          plugin.openaiClient.responses.inputItems.list(previousResponseId),
        ]);
        const outputMsg = response.output.find((o) => o.type === "message");
        const inputMsg = input.data.find(
          (i) => i.type === "message" && i.role === "user"
        );
        const annotations =
          outputMsg?.content.find((o) => o.type === "output_text")
            ?.annotations || null;
        const file_results =
          response.output.find((o) => o.type === "file_search_call")?.results ||
          null;

        // Only update state if this is still the latest requested conversation
        if (
          latestConversationId.current === selectedConversationId &&
          !abortController.signal.aborted
        ) {
          setMessages((prev) => {
            // Store messages in the map with responseId as key
            prev
              .set(response.id, {
                content: response.output_text,
                role: outputMsg?.role || "assistant",
                type: "response_item",
                previous_response_id: response.previous_response_id || null,
                annotations,
                file_results,
              })
              .set(`input-${response.id}`, {
                content:
                  (inputMsg &&
                    "content" in inputMsg &&
                    inputMsg.content.find((c) => c.type === "input_text")
                      ?.text) ||
                  "",
                role:
                  (inputMsg && "role" in inputMsg && inputMsg.role) || "user",
                type: "input_item",
              });
            return new Map(prev);
          });
        }

        previousResponseId = response.previous_response_id || null;
        count++;
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        new Notice(`${PLUGIN_NAME}\n❌ Failed to load conversation history`);
        console.error("Failed to load history:", err);
      }
    }

    // Only update state if this is still the latest requested conversation
    if (
      latestConversationId.current === selectedConversationId &&
      !abortController.signal.aborted
    ) {
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
    setMessages((prev) => {
      prev.set(`input-${lastResponseId}`, userMessage);
      return new Map(prev);
    });
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

      setMessages((prev) => {
        prev.set(response.id, {
          role: "assistant",
          content: assistantMessage,
          type: "response_item",
          previous_response_id: response.previous_response_id || null,
        });
        return new Map(prev);
      });

      // Update the last response ID in settings
      if (index !== -1) {
        plugin.settings.conversations[index].lastResponseId = response.id;
        plugin.saveSettings();
      }
    } catch (err) {
      setMessages((prev) => {
        prev.set(`error-${lastResponseId}`, {
          role: "assistant",
          content: "Error: " + (err?.message || err),
          type: "response_item",
          previous_response_id: lastResponseId || null,
        });
        return new Map(prev);
      });
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
    loadHistory();
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
      setMessages((prev) => new Map(prev));
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
      loadHistory();
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
          onChange={(e) => {
            plugin.settings.selectedConversation = e.target.value;
            plugin.saveSettings();
            loadHistory();
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
            new DeleteConversationModal(app, () => {
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
          <Icon name="trash" />
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
              app,
              plugin,
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
          <Icon name="pencil" />
        </button>
        <button
          onClick={() => {
            new NewConversationModal(app, (name) => {
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
          <Icon name="message-square-plus" />
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 8,
          background: "var(--background-secondary)",
          display: "flex",
          flexDirection: "column-reverse",
          gap: "6px",
        }}
      >
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
        {messages.size === 0 && (
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
        {[...messages].map(([id, msg]) => (
          <MessageBubble key={id} item={msg} />
        ))}
        {loadingHistory && (
          <div style={{ textAlign: "center", color: "var(--text-faint)" }}>
            Loading history...
          </div>
        )}
      </div>
      <form
        style={{
          display: "flex",
          flexDirection: "column",
          borderTop: "1px solid var(--background-modifier-border)",
          padding: 8,
          gap: 8,
        }}
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
      >
        {/* Context: Suggest open files as button list */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 4,
            flexWrap: "wrap",
          }}
        >
          {contextFiles.map((cFile) => {
            if (!cFile) return null;
            return (
              <FileReference
                key={cFile.path}
                file={cFile}
                onClick={(file) => {
                  setContextFiles((prev) => {
                    return prev.filter((f) => f.path !== file.path);
                  });
                }}
                appendName={
                  cFile.selection && cFile.offset
                    ? `${cFile.offset[0]} - ${cFile.offset[1]}`
                    : undefined
                }
                title={`Remove "${cFile.name}" as context`}
                style={{
                  border: "2px dashed transparent",
                  maxWidth: "calc(50% - 4px)",
                }}
              />
            );
          })}
          {!!suggestedFile &&
            !contextFiles.find(
              (el) =>
                el.path === suggestedFile.path &&
                (el.selection === suggestedFile.selection ||
                  // suggestedFile offset is inside contextFiles offset
                  (el.offset &&
                    suggestedFile.offset &&
                    // ...
                    suggestedFile.offset[0] >= el.offset[0] &&
                    suggestedFile.offset[0] <= el.offset[1] &&
                    // ...
                    suggestedFile.offset[1] <= el.offset[1] &&
                    suggestedFile.offset[1] >= el.offset[0]))
            ) && (
              <FileReference
                file={suggestedFile}
                onClick={(file) => {
                  setContextFiles((prev) => [...prev, file]);
                }}
                appendName={
                  suggestedFile.selection && suggestedFile.offset
                    ? `${suggestedFile.offset[0]} - ${suggestedFile.offset[1]}`
                    : undefined
                }
                title={`Add "${suggestedFile.name}" as context`}
                style={{
                  border: "2px dashed var(--background-modifier-border)",
                  background: "none",
                  maxWidth: "calc(50% - 4px)",
                }}
              />
            )}
        </div>
        <TextareaAutosize
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message to VectorLink Assistant..."
          maxRows={15}
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 6,
            border: "1px solid var(--background-modifier-border)",
            resize: "none",
          }}
          disabled={thinking}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* External file upload */}
            {/* Add external file button */}
            <button
              type="button"
              style={{
                fontSize: 12,
                color: "var(--text-faint)",
                padding: "6px 12px",
                borderRadius: 6,
                border: "none",
                background: "var(--background-modifier-accent)",
              }}
              disabled={thinking}
              onClick={() => {
                // Create a hidden file input and trigger click
                const input = document.createElement("input");
                input.type = "file";
                input.onchange = async (e: any) => {
                  const file = e.target.files?.[0];
                  if (!file || !plugin.openaiClient) return;
                  try {
                    new Notice(`${PLUGIN_NAME}\nUploading file: ${file.name}`);
                    // Example: await plugin.uploadFileToVectorStore(file);
                  } catch (err) {
                    new Notice(`${PLUGIN_NAME}\n❌ Failed to upload file`);
                  }
                };
                input.click();
              }}
              title="Add external file"
            >
              <Icon name="file-plus" />
            </button>

            {/* Context: Suggest open files */}
            <select
              multiple
              style={{ width: 180, marginTop: 2 }}
              disabled={thinking}
              onChange={(e) => {
                // You can store selected files in a state if needed
                // Example: setContextFiles([...e.target.selectedOptions].map(o => o.value));
              }}
            >
              {/* {(app.workspace.getLeavesOfType("markdown") || []).map(
                (leaf, idx) => {
                  const file = leaf.view.file;
                  return file ? (
                    <option key={file.path} value={file.path}>
                      {file.name}
                    </option>
                  ) : null;
                }
              )} */}
            </select>

            {/* Background options */}
            <select
              style={{ width: 180, marginTop: 2 }}
              disabled={thinking}
              onChange={(e) => {
                // You can store selected background option in a state if needed
                // Example: setBackgroundOption(e.target.value);
              }}
            >
              <option value="">Default</option>
              <option value="long_text">Write very long text</option>
              <option value="novel">Write a novel according to note</option>
              <option value="reasoning">Enable more reasoning model</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              type="submit"
              disabled={thinking || !input.trim()}
              style={{ padding: "8px 16px", borderRadius: 6, height: "100%" }}
            >
              <Icon name="send" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
