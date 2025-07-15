import { getIcon } from "obsidian";

export const Icon = ({ name }: { name: string }) => (
  <span
    dangerouslySetInnerHTML={{
      __html: getIcon(name)?.outerHTML || "",
    }}
    style={{
      display: "inline-flex",
      verticalAlign: "middle",
    }}
  />
);
