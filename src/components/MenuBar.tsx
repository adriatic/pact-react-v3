// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
import { useEffect, useRef, useState } from "react";

type Props = {
  onNew: () => void;

  onEdit: () => void;
  onCancelEdit: () => void;

  onRun: () => void;
  onCompare: () => void;

  canCompare: boolean;

  viewMode: "normal" | "raw";
  onSetView: (mode: "normal" | "raw") => void;

  isEditing: boolean;
};

export default function MenuBar({
  onNew,

  onEdit,
  onCancelEdit,

  onRun,
  onCompare,

  canCompare,

  viewMode,
  onSetView,

  isEditing,
}: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function toggle(menu: string) {
    setOpen(prev => (prev === menu ? null : menu));
  }

  function close() {
    setOpen(null);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        close();
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () =>
      document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div
      ref={ref}
      className="flex gap-6 px-4 py-2 border-b border-gray-700 text-sm bg-black text-white relative"
    >
      {/* FILE */}
      <div className="relative">
        <div className="cursor-pointer" onClick={() => toggle("file")}>
          File
        </div>

        {open === "file" && (
          <div className="menu">
            <Item
              label="Create New Prompt"
              onClick={() => {
                onNew();
                close();
              }}
            />
          </div>
        )}
      </div>

      {/* EDIT */}
      <div className="relative">
        <div className="cursor-pointer" onClick={() => toggle("edit")}>
          Edit
        </div>

        {open === "edit" && (
          <div className="menu">
            <Item
              label="Edit Prompt"
              disabled={isEditing}
              onClick={() => {
                onEdit();
                close();
              }}
            />

            <Item
              label="Cancel Edit"
              disabled={!isEditing}
              onClick={() => {
                onCancelEdit();
                close();
              }}
            />
          </div>
        )}
      </div>

      {/* RUN */}
      <div className="relative">
        <div className="cursor-pointer" onClick={() => toggle("run")}>
          Run
        </div>

        {open === "run" && (
          <div className="menu">
            <Item
              label="Execute"
              onClick={() => {
                onRun();
                close();
              }}
            />
          </div>
        )}
      </div>

      {/* COMPARE */}
      <div className="relative">
        <div
          className={`cursor-pointer ${
            canCompare ? "" : "opacity-40"
          }`}
          onClick={() => toggle("compare")}
        >
          Compare
        </div>

        {open === "compare" && (
          <div className="menu">
            <Item
              label="Compare Selected"
              disabled={!canCompare}
              onClick={() => {
                onCompare();
                close();
              }}
            />
          </div>
        )}
      </div>

      {/* VIEW */}
      <div className="relative">
        <div className="cursor-pointer" onClick={() => toggle("view")}>
          View
        </div>

        {open === "view" && (
          <div className="menu">
            <Item
              label="Normal View"
              active={viewMode === "normal"}
              onClick={() => {
                onSetView("normal");
                close();
              }}
            />

            <Item
              label="Raw View"
              active={viewMode === "raw"}
              onClick={() => {
                onSetView("raw");
                close();
              }}
            />

            <Divider />

            <Item label="Core Prompts" onClick={() => {}} />
            <Item label="User Prompts" onClick={() => {}} />
            <Item label="Integrated Library" onClick={() => {}} />
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------
// Sub-components
// --------------------

function Item({
  label,
  onClick,
  disabled,
  active,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`px-4 py-2 cursor-pointer
        ${disabled ? "opacity-40 pointer-events-none" : ""}
        ${active ? "bg-gray-700" : "hover:bg-gray-700"}`}
      onClick={onClick}
    >
      {label}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-gray-700 my-1" />;
}