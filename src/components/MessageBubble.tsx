import { useState, useMemo } from "react";
import { ResponseOutputText } from "openai/resources/responses/responses";
import { MarkdownDecorator } from "./MarkdownDecorator";
import { AnnotationHandler } from "./AnnotationHandler";
import { Icon } from "./Icon";
import { useApp } from "../context";
import type { ResponseItem, EnrichedChunk } from "../types";

// Helper: enrich text with citations
const enrichTextWithCitations = (
  chunk: Extract<EnrichedChunk, { type: "markdown" | "text" }>,
  annotations: ResponseOutputText.FileCitation[],
  item: ResponseItem
) => {
  const chunks: EnrichedChunk[] = [];
  let relStart = 0; // relative to chunk.value
  const chunkAbsStart = chunk.indexStart ?? 0;
  const chunkAbsEnd = chunk.indexEnd ?? chunkAbsStart + chunk.value.length;

  // Filter annotations that are within this chunk's range
  const relevantAnnotations = annotations
    .filter((a) => a.index >= chunkAbsStart && a.index < chunkAbsEnd)
    .sort((a, b) => a.index - b.index);

  // let lastAbs = chunkAbsStart;
  for (let i = 0; i < relevantAnnotations.length; i++) {
    const a = relevantAnnotations[i];
    const relIndex = a.index - chunkAbsStart;
    // Add text before the citation
    if (relIndex > relStart) {
      chunks.push({
        type: "text",
        value: chunk.value.slice(relStart, relIndex),
        indexStart: chunkAbsStart + relStart,
        indexEnd: chunkAbsStart + relIndex,
      });
    }
    // Add the citation chunk
    chunks.push({
      type: "citation",
      citation: a,
      fileResults: item.file_results, // file_results should be on the annotation
      index: a.index,
    });
    relStart = relIndex;
    // lastAbs = a.index;
  }
  // Add any remaining text after the last citation
  if (relStart < chunk.value.length) {
    chunks.push({
      type: "text",
      value: chunk.value.slice(relStart),
      indexStart: chunkAbsStart + relStart,
      indexEnd: chunkAbsEnd,
    });
  }
  return chunks;
};

// Helper: extract :::gpt-markdown blocks
const parseGptMarkdown = (
  item: ResponseItem,
  annotations: ResponseOutputText.FileCitation[]
) => {
  const regex = /:::gpt-markdown[\r\n]+([\s\S]*?)\n?:::/g;
  let lastIndex = 0;
  const result: EnrichedChunk[] = [];
  let match;
  while ((match = regex.exec(item.content)) !== null) {
    if (match.index > lastIndex) {
      const textChunk: EnrichedChunk = {
        type: "text",
        value: item.content.slice(lastIndex, match.index),
        indexStart: lastIndex,
        indexEnd: match.index,
      };

      const newChunks = enrichTextWithCitations(textChunk, annotations, item);

      result.push(...newChunks);
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

  const annotations = useMemo(() => {
    const fileCitations: ResponseOutputText.FileCitation[] = [];

    if (item.annotations && Array.isArray(item.annotations)) {
      item.annotations.map((annotation) => {
        if (annotation.type === "file_citation") {
          fileCitations.push(annotation);
        }
      });
    }

    return [...fileCitations];
  }, [item.annotations, app.vault]);

  const parsed = useMemo(
    () => parseGptMarkdown(item, annotations),
    [item.content, annotations]
  );

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
        {parsed.map((block, i) => {
          switch (block.type) {
            case "citation":
              return (
                <AnnotationHandler
                  key={i}
                  annotation={block.citation}
                  fileResults={block.fileResults}
                />
              );
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
