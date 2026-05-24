// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { SerializedContentBlock } from "../types/contentBlock";

export type LLMModel = "gpt" | "claude";

export type ImageAttachment = {
  base64: string;
  mimeType: string;
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
  ): Promise<string> {
    if (model === "gpt") {
      if (!this.openai) {
        return this.error("OpenAI API key not set", onToken);
      }
      return this.runGPT(prompt, onToken, blocks, systemPrompt, resolvedModel ?? "gpt-4.1");
    }
    if (model === "claude") {
      if (!this.claude) {
        return this.error("Claude API key not set", onToken);
      }
      return this.runClaude(prompt, onToken, blocks, systemPrompt, resolvedModel ?? "claude-sonnet-4-6");
    }
    return this.error("Unknown model", onToken);
  }

  private async runGPT(
    prompt: string,
    onToken?: (t: string) => void,
    blocks: SerializedContentBlock[] = [],
    systemPrompt?: string,
    resolvedModel: string = "gpt-4.1",
  ): Promise<string> {
    let full = "";

    const content: OpenAI.Chat.ChatCompletionContentPart[] = blocks.map(block => {
      if (block.type === "image") {
        return {
          type: "image_url",
          image_url: {
            url: `data:${block.mimeType};base64,${block.base64}`,
          },
        } as OpenAI.Chat.ChatCompletionContentPart;
      } else {
        return {
          type: "text",
          text: block.text,
        } as OpenAI.Chat.ChatCompletionContentPart;
      }
    });

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
  ): Promise<string> {
    let full = "";

    const content: Anthropic.MessageParam["content"] = blocks.map(block => {
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
        return {
          type: "text",
          text: block.text,
        } as Anthropic.TextBlockParam;
      }
    });

    const stream = await this.claude!.messages.stream({
      model: resolvedModel,
      max_tokens: 2000,
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
    }

    return full;
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