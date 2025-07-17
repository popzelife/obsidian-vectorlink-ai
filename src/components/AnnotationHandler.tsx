import { useState, useEffect } from "react";
import {
  ResponseFileSearchToolCall,
  ResponseOutputText,
} from "openai/resources/responses/responses";
import { Icon } from "./Icon";
import { FileReference } from "./FileReference";
import { useApp } from "../context";
import { TFile } from "obsidian";

export const AnnotationHandler = ({
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
  } as TFile);

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
      title={file.path}
      appendName={` ${annotation.index} - ${annotation.index + 100}`}
      onOpenClick={(file, leaf) => {
        leaf.view.editor.setCursor(annotation.index);
      }}
      style={{
        maxWidth: "fit-content",
        fontSize: 12,
        margin: "4px 0",
        position: "absolute",
        width: "20%",
        right: "-20%",
      }}
      icon={<Icon name="info" />}
    />
  );
};
