// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
type Props = {
  left: string;
  right: string;
};

export default function DiffView({ left, right }: Props) {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");

  const max = Math.max(leftLines.length, rightLines.length);

  return (
    <div className="grid grid-cols-2 gap-4 mt-6">
      <div className="bg-gray-900 border border-gray-700 rounded p-3">
        {Array.from({ length: max }).map((_, i) => {
          const l = leftLines[i] ?? "";
          const r = rightLines[i] ?? "";

          const changed = l !== r;

          return (
            <div key={i} className={changed ? "bg-red-900/40" : ""}>
              {l || " "}
            </div>
          );
        })}
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded p-3">
        {Array.from({ length: max }).map((_, i) => {
          const l = leftLines[i] ?? "";
          const r = rightLines[i] ?? "";

          const changed = l !== r;

          return (
            <div key={i} className={changed ? "bg-green-900/40" : ""}>
              {r || " "}
            </div>
          );
        })}
      </div>
    </div>
  );
}
