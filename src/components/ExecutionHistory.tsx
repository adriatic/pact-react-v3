// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
type Run = {
  id: string;
  version: number;
  response: string;
};

type Props = {
  runs: Run[];
  selected: string[];
  onToggle: (id: string) => void;
};

export default function ExecutionHistory({
  runs,
  selected,
  onToggle,
}: Props) {
  return (
    <div className="mt-6">
      <div className="text-gray-400 mb-2">Execution History</div>

      <div className="flex flex-col gap-3">
        {runs.map(run => {
          const isChecked = selected.includes(run.id);

          return (
            <div
              key={run.id}
              className="border border-gray-700 rounded-lg p-3 bg-gray-900"
            >
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggle(run.id)}
                />
                <div className="text-sm text-gray-400">
                  Run #{run.version} → v{run.version}
                </div>
              </div>

              <div className="text-sm whitespace-pre-wrap">
                {run.response}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}