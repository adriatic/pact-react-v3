// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
// src/llm.ts

type StreamLLMOptions = {
  prompt: string;
  onToken: (token: string) => void;
  signal: AbortSignal;
};

type OpenAIStreamChunk = {
  choices?: {
    delta?: {
      content?: string;
    };
  }[];
};

export async function streamLLM({
  prompt,
  onToken,
  signal,
}: StreamLLMOptions): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`LLM request failed: ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");

      buffer = lines.pop() || "";

      for (let line of lines) {
        line = line.trim();

        if (!line.startsWith("data:")) continue;

        const data = line.replace("data:", "").trim();

        if (data === "[DONE]") {
          return;
        }

        try {
          const parsed: OpenAIStreamChunk = JSON.parse(data);

          const token = parsed.choices?.[0]?.delta?.content;

          if (token) {
            onToken(token);
          }
        } catch {
          // ignore partial JSON
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return; // expected on Stop
    }

    throw err;
  }
}
