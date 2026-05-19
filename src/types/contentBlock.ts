// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
export type TextBlock = {
  type: "text";
  text: string;
};

export type ImageBlock = {
  type: "image";
  base64: string;
  mimeType: string;
  previewUrl?: string; // only present in webview, not sent to extension host
};

export type ContentBlock = TextBlock | ImageBlock;

// Serialized form for postMessage and storage (no previewUrl)
export type SerializedContentBlock =
  | TextBlock
  | Omit<ImageBlock, "previewUrl">;