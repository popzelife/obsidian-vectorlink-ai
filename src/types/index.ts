import {
  ResponseFileSearchToolCall,
  ResponseOutputText,
} from "openai/resources/responses/responses";

export type Annotations = Array<
  | ResponseOutputText.FileCitation
  | ResponseOutputText.URLCitation
  | ResponseOutputText.ContainerFileCitation
  | ResponseOutputText.FilePath
>;

export interface ResponseItem {
  type: "response_item" | "input_item";
  role: "user" | "assistant" | "system" | "developer";
  content: string;
  previous_response_id?: string | null;
  annotations?: Annotations | null;
  file_results?: ResponseFileSearchToolCall.Result[] | null;
}

export type EnrichedChunk = {
  type: "markdown" | "text";
  value: string;
  indexStart: number;
  indexEnd: number;
};
export type CitationChunk = {
  type: "citation";
  citation: ResponseOutputText.FileCitation;
  fileResults: ResponseFileSearchToolCall.Result[] | null | undefined;
  index: number;
};
