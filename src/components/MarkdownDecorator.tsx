import { useRef, useEffect } from "react";
import { MarkdownRenderer } from "obsidian";
import { useApp } from "../context";

export const MarkdownDecorator = ({
  content,
  style,
}: {
  content: string;
  style?: React.CSSProperties;
}) => {
  const { app, plugin } = useApp();

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
