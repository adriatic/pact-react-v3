// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
import type { Prompt } from "../types/types";

type Props = {
  prompts: Prompt[];
  currentId: string;
  onSelect: (id: string) => void;
};

export default function PromptList({
  prompts,
  currentId,
  onSelect,
}: Props) {
  return (
    <div className="w-64 border-r border-gray-700 p-2">
      {prompts.map(p => (
        <div
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={`p-2 cursor-pointer rounded ${
            p.id === currentId
              ? "bg-gray-700"
              : "hover:bg-gray-800"
          }`}
        >
          {p.title}
        </div>
      ))}
    </div>
  );
}