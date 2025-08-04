import { useState, useMemo } from "react";
import { ResponseOutputText } from "openai/resources/responses/responses";
import { MarkdownDecorator } from "./MarkdownDecorator";
// import { AnnotationHandler } from "./AnnotationHandler";
import { Icon } from "./Icon";
import { useApp } from "../context";
import type { ResponseItem, EnrichedChunk } from "../types";

// Add footnote for annotations
const enrichTextWithCitations = (
  textChunks: EnrichedChunk[],
  fileCitations: ResponseOutputText.FileCitation[]
) => {
  // Parse text chunks and enrich with citations footnotes
  // For each text chunk, check if any citation index falls within its range
  textChunks.forEach((chunk, index) => {
    const footnotes: string[] = [];

    let chunkText = chunk.value;
    let offset = 0;
    fileCitations.forEach((citation) => {
      // Check if citation index is within this chunk
      if (
        citation.index >= chunk.indexStart &&
        citation.index < chunk.indexEnd
      ) {
        // Position in chunk text
        const pos = citation.index - chunk.indexStart + offset;
        const footnoteNum = footnotes.length + 1;
        // Insert footnote marker at citation position
        chunkText =
          chunkText.slice(0, pos) + `[^${footnoteNum}]` + chunkText.slice(pos);
        offset += `[^${footnoteNum}]`.length;
        // Add footnote entry
        footnotes.push(
          `[^${footnoteNum}]: ${citation.filename} - ${citation.index}`
        );
      }
    });

    // Update chunk text with footnotes
    chunk.value = chunkText;
    // Add footnotes at the end of the text chunks
    chunk.value += footnotes.length > 0 ? `\n\n${footnotes.join("\n")}` : "";
  });

  return textChunks;
};

// Helper: extract :::gpt-markdown blocks
const parseGptMarkdown = (item: ResponseItem) => {
  const regex = /:::gpt-markdown[\r\n]+([\s\S]*?)\n?:::/g;
  let lastIndex = 0;
  const result: EnrichedChunk[] = [];
  let match;
  while ((match = regex.exec(item.content)) !== null) {
    if (match.index > lastIndex) {
      result.push({
        type: "text",
        value: item.content.slice(lastIndex, match.index),
        indexStart: lastIndex,
        indexEnd: match.index,
      });
    }
    result.push({
      type: "markdown",
      value: match[1],
      indexStart: match.index,
      indexEnd: regex.lastIndex,
    });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < item.content.length) {
    result.push({
      type: "text",
      value: item.content.slice(lastIndex),
      indexStart: lastIndex,
      indexEnd: item.content.length,
    });
  }
  return result;
};

export const MessageBubble = ({ item }: { item: ResponseItem }) => {
  const { app } = useApp();
  const [hover, setHover] = useState(false);

  const textChunks = useMemo(() => {
    const fileCitations: ResponseOutputText.FileCitation[] = [];

    if (item.annotations && Array.isArray(item.annotations)) {
      item.annotations.map((annotation) => {
        if (annotation.type === "file_citation") {
          fileCitations.push(annotation);
        }
      });
    }

    const textChunks = enrichTextWithCitations(
      parseGptMarkdown(item),
      fileCitations
    );

    return textChunks;
  }, [item.content, item.annotations]);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        margin: "8px 0",
        textAlign: item.type === "response_item" ? "left" : "right",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: item.type === "response_item" ? "start" : "end",
        gap: 1,
      }}
    >
      <div
        style={{
          display: "inline-block",
          background:
            item.type === "input_item"
              ? "var(--interactive-accent)"
              : "var(--background-modifier-box-highlight)",
          color: item.type === "input_item" ? "#fff" : "inherit",
          borderRadius: 8,
          padding: "8px 12px",
          maxWidth: "80%",
          wordBreak: "break-word",
          position: "relative",
          userSelect: "text",
          // @ts-ignore
          "--text-selection":
            item.type === "input_item"
              ? "var(--interactive-hover)"
              : "var(--color-accent)",
        }}
      >
        {textChunks.map((block, i) => {
          switch (block.type) {
            case "markdown":
              return (
                <div
                  key={i}
                  style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: 6,
                    margin: "8px 0",
                    fontFamily: "var(--font-monospace)",
                    position: "relative",
                    backgroundColor: "var(--background-primary)",
                    overflow: "hidden",
                  }}
                  onClick={(e) => {
                    // check right click
                    if (e.button === 3) {
                      // open context menu
                      e.preventDefault();
                      app.workspace.trigger(
                        "context-menu",
                        e,
                        {
                          type: "markdown",
                          value: block.value,
                        },
                        {
                          onCopy: () => {
                            navigator.clipboard.writeText(block.value);
                          },
                        }
                      );
                    }
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
                      <Icon name="clipboard-copy" />
                    </button>
                  </div>
                  <MarkdownDecorator
                    content={block.value}
                    style={{
                      padding: "0 8px",
                    }}
                  />
                </div>
              );
            case "text":
            default:
              return <MarkdownDecorator key={i} content={block.value} />;
          }
        })}
      </div>
      <button
        type="button"
        aria-label="Copy message"
        className="clickable-icon"
        style={{
          opacity: hover ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}
        onClick={() => {
          navigator.clipboard.writeText(item.content);
        }}
        title="Copy to clipboard"
      >
        <Icon name="clipboard-copy" />
      </button>
    </div>
  );
};
