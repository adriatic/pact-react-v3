// Copyright © 2026 PACTResearch.net. All rights reserved.
// pactresearch.net
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { SerializedContentBlock } from "../types/contentBlock";

export type LLMModel = "gpt" | "claude";

export type ImageAttachment = {
  base64: string;
  mimeType: string;
};

export type LLMResult = {
  content: string;
  stopReason: string;
  stoppedAfterSection: number | null;
  totalSections: number | null;
};

export class LLMRouter {
  private openai: OpenAI | null = null;
  private claude: Anthropic | null = null;

  setApiKey(key: string | undefined) {
    this.openai = key ? new OpenAI({ apiKey: key }) : null;
  }

  setClaudeKey(key: string | undefined) {
    this.claude = key ? new Anthropic({ apiKey: key }) : null;
  }

  async run(
    model: LLMModel,
    prompt: string,
    onToken?: (t: string) => void,
    blocks: SerializedContentBlock[] = [],
    systemPrompt?: string,
    resolvedModel?: string,
    toc: string[] = [],
    abortSignal?: AbortSignal,
  ): Promise<LLMResult> {
    const normalizedModel: LLMModel = (model as string).includes("claude") ? "claude" : "gpt";

    if (normalizedModel === "gpt") {
      if (!this.openai) {
        const content = await this.error("OpenAI API key not set", onToken);
        return { content, stopReason: "error", stoppedAfterSection: null, totalSections: null };
      }
      const content = await this.runGPT(prompt, onToken, blocks, systemPrompt, resolvedModel ?? "gpt-4.1");
      return { content, stopReason: "end_turn", stoppedAfterSection: null, totalSections: null };
    }
    if (normalizedModel === "claude") {
      if (!this.claude) {
        const content = await this.error("Claude API key not set", onToken);
        return { content, stopReason: "error", stoppedAfterSection: null, totalSections: null };
      }
      return this.runClaude(prompt, onToken, blocks, systemPrompt, resolvedModel ?? "claude-sonnet-4-6", toc, abortSignal);
    }
    const content = await this.error("Unknown model", onToken);
    return { content, stopReason: "error", stoppedAfterSection: null, totalSections: null };
  }

  async runMultiTurn(
    model: LLMModel,
    messages: { role: string; content: string }[],
    systemPrompt?: string,
    resolvedModel?: string,
  ): Promise<string> {
    if (model === "claude") {
      if (!this.claude) return "ERROR: Claude API key not set";
      const response = await this.claude.messages.create({
        model: resolvedModel ?? "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });
      return response.content[0].type === "text" ? response.content[0].text : "";
    }
    if (model === "gpt") {
      if (!this.openai) return "ERROR: OpenAI API key not set";
      const response = await this.openai.chat.completions.create({
        model: resolvedModel ?? "gpt-4.1",
        max_tokens: 1000,
        messages: [
          ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
          ...messages.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ],
      });
      return response.choices[0].message.content ?? "";
    }
    return "ERROR: Unknown model";
  }

  private async runGPT(
    prompt: string,
    onToken?: (t: string) => void,
    blocks: SerializedContentBlock[] = [],
    systemPrompt?: string,
    resolvedModel: string = "gpt-4.1",
  ): Promise<string> {
    let full = "";

    // If blocks is empty, use prompt as a plain text message
    const content: OpenAI.Chat.ChatCompletionContentPart[] = blocks.length > 0
      ? blocks.map(block => {
          if (block.type === "image") {
            return {
              type: "image_url",
              image_url: { url: `data:${block.mimeType};base64,${block.base64}` },
            } as OpenAI.Chat.ChatCompletionContentPart;
          } else {
            return { type: "text", text: block.text } as OpenAI.Chat.ChatCompletionContentPart;
          }
        })
      : [{ type: "text", text: prompt }];

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content });

    const stream = await this.openai!.chat.completions.create({
      model: resolvedModel,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) {
        full += token;
        onToken?.(token);
      }
    }

    return full;
  }

  private async runClaude(
    prompt: string,
    onToken?: (t: string) => void,
    blocks: SerializedContentBlock[] = [],
    systemPrompt?: string,
    resolvedModel: string = "claude-sonnet-4-6",
    toc: string[] = [],
    abortSignal?: AbortSignal,
  ): Promise<LLMResult> {
    let full = "";

    // If blocks is empty, use prompt as a plain text message
    // This handles XM continuations after restart where blocks are not persisted
    const content: Anthropic.MessageParam["content"] = blocks.length > 0
      ? blocks.map(block => {
          if (block.type === "image") {
            return {
              type: "image",
              source: {
                type: "base64",
                media_type: block.mimeType as "image/png" | "image/jpeg" | "image/webp",
                data: block.base64,
              },
            } as Anthropic.ImageBlockParam;
          } else {
            return { type: "text", text: block.text } as Anthropic.TextBlockParam;
          }
        })
      : [{ type: "text", text: prompt }];

    const stream = this.claude!.messages.stream({
      model: resolvedModel,
      max_tokens: 30000,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        const delta: any = event.delta;
        if (delta.type === "text_delta") {
          const token = delta.text || "";
          full += token;
          onToken?.(token);
        }
      }
      // Check abort signal after each token — ToC complete was detected upstream
      if (abortSignal?.aborted) {
        stream.abort();
        console.log("PACT stream aborted — ToC complete");
        return {
          content: full,
          stopReason: "toc_complete",
          stoppedAfterSection: null,
          totalSections: null,
        };
      }
    }

    const finalMessage = await stream.finalMessage();
    const stopReason = finalMessage.stop_reason ?? "end_turn";

    console.log("PACT stopReason:", stopReason, "toc.length:", toc.length);
    if (stopReason === "max_tokens" && toc.length > 0) {
      const { trimmed, stoppedAfterSection } = this.trimToLastCompletedSection(full, toc);
      return {
        content: trimmed,
        stopReason,
        stoppedAfterSection,
        totalSections: toc.length,
      };
    }

    return {
      content: full,
      stopReason,
      stoppedAfterSection: null,
      totalSections: toc.length > 0 ? toc.length : null,
    };
  }

  private trimToLastCompletedSection(
    full: string,
    toc: string[],
  ): { trimmed: string; stoppedAfterSection: number } {
    const sectionPositions: { index: number; sectionNumber: number }[] = [];

    for (let i = 0; i < toc.length; i++) {
      const title = toc[i];
      const sectionNumber = i + 1;
      const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(
        `(?:^|\\n)(?:#{1,4}\\s*)?(?:${sectionNumber}\\.\\s*)?${escaped}`,
        "i",
      );
      const match = pattern.exec(full);
      if (match) {
        sectionPositions.push({ index: match.index, sectionNumber });
      }
    }

    if (sectionPositions.length === 0) {
      return { trimmed: full, stoppedAfterSection: 0 };
    }

    sectionPositions.sort((a, b) => a.index - b.index);

    console.log("PACT sectionPositions:", JSON.stringify(sectionPositions));
    console.log("PACT last section:", sectionPositions[sectionPositions.length - 1]);

    const last = sectionPositions[sectionPositions.length - 1];
    const nextSectionNumber = last.sectionNumber + 1;
    const nextEntry = sectionPositions.find(p => p.sectionNumber === nextSectionNumber);
    const trimEnd = nextEntry ? nextEntry.index : full.length;
    const trimmed = full.slice(0, trimEnd).trimEnd();

    return { trimmed, stoppedAfterSection: last.sectionNumber };
  }

  private async error(msg: string, onToken?: (t: string) => void) {
    const text = "ERROR: " + msg + "\n";
    for (const ch of text) {
      await new Promise((r) => setTimeout(r, 2));
      onToken?.(ch);
    }
    return text;
  }
}
