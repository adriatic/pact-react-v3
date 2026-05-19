// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
import type { Prompt } from "../types/types";

type Props = {
  prompt: Prompt;
  isEditing: boolean;
  onChange: (text: string) => void;
};

export default function PromptEditor({
  prompt,
  isEditing,
  onChange,
}: Props) {
  return (
    <div className="mb-6">
      <div className="text-sm text-gray-400 mb-2">
        {isEditing ? "Draft" : "Executed Prompt"}
      </div>

      {isEditing ? (
        <textarea
          className="w-full h-32 bg-gray-900 border border-gray-700 rounded p-3"
          value={prompt.draft}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="bg-gray-900 border border-gray-700 rounded p-3">
          {prompt.draft}
        </div>
      )}
    </div>
  );
}