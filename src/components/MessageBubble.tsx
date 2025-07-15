import { useState, useMemo, useEffect } from "react";
import {
  ResponseFileSearchToolCall,
  ResponseOutputText,
} from "openai/resources/responses/responses";
import { MarkdownDecorator } from "./MarkdownDecorator";
import { Icon } from "./Icon";
import { FileReference } from "./FileReference";
import { useApp } from "../context";
import type { ResponseItem } from "../types";
import { TFile } from "obsidian";

type EnrichedChunk =
  | {
      type: "markdown" | "text";
      value: string;
    }
  | {
      type: "citation";
      citation: ResponseOutputText.FileCitation;
      fileResults: ResponseFileSearchToolCall.Result[] | null | undefined;
    };

const AnnotationHandler = ({
  annotation,
  fileResults,
}: {
  annotation: ResponseOutputText.FileCitation;
  fileResults: ResponseFileSearchToolCall.Result[] | null | undefined;
}) => {
  const { app } = useApp();

  const getFileCitation = () => {
    const file = fileResults?.find((f) => f.file_id === annotation.file_id);

    return {
      ...file,
      file_id: annotation.file_id,
      filename: file?.filename || annotation.filename,
      index: annotation.index,
    };
  };

  const [file, setFile] = useState<TFile>({
    basename: annotation.filename.split(".")[0] || "",
    extension: annotation.filename.split(".").pop() || "",
    stat: {
      ctime: -1,
      mtime: -1,
      size: -1,
    },
    vault: app.vault,
    path: "",
    name: annotation.filename,
    parent: null,
  });

  useEffect(() => {
    const file = getFileCitation();

    const path =
      typeof file.attributes?.name === "string" ? file.attributes.name : null;
    if (!path) return;
    const tFile = app.vault.getFileByPath(path);
    if (tFile) setFile(tFile);
  }, []);

  return (
    <FileReference
      file={file}
      style={{ fontSize: 12, color: "var(--text-muted)" }}
      title={file.path}
      appendName={` ${annotation.index} - ${annotation.index + 100}`}
      // onClick={(file) => {
      //   // Handle file click if needed
      // }}
      onOpenClick={(file, leaf) => {
        leaf.view.editor.setCursor(annotation.index);
      }}
    />
  );
};

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

// Helper: enrich text with citations
const enrichTextWithCitations = (
  item: ResponseItem,
  annotations: ResponseOutputText.FileCitation[]
) => {
  const chunks: EnrichedChunk[] = [];

  let lastIndex = 0;
  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i];
    // Find the end of the sentence after a.index
    let endIndex = a.index;
    const sentenceEndRegex = /[.!?](?:\s|$)/g;
    sentenceEndRegex.lastIndex = endIndex;
    const match = sentenceEndRegex.exec(item.content);
    if (match) {
      endIndex = sentenceEndRegex.lastIndex;
    }
    const value = item.content.slice(lastIndex, endIndex);
    const parsed = parseGptMarkdown(value);
    chunks.push(...parsed);
    chunks.push({
      type: "citation",
      citation: a,
      fileResults: item.file_results,
    });

    lastIndex = endIndex;
  }

  const lastParsed = parseGptMarkdown(item.content.slice(lastIndex));
  chunks.push(...lastParsed);
  return chunks;
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
    () => enrichTextWithCitations(item, annotations),
    [item.content, annotations]
  );

  console.info("MessageBubble", {
    item,
    parsed,
    annotations,
  });

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
