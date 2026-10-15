"use client";
import { useEffect, useRef } from "react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
export function RichText({
  initial,
  onChange,
}: {
  initial: string;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initial;
  }, []);
  return (
    <div className="rich-editor">
      <div className="rich-toolbar">
        {[
          { command: "bold", label: "Bold", Icon: Bold },
          { command: "italic", label: "Italic", Icon: Italic },
          { command: "insertUnorderedList", label: "Bullet list", Icon: List },
          {
            command: "insertOrderedList",
            label: "Numbered list",
            Icon: ListOrdered,
          },
        ].map(({ command, label, Icon }) => (
          <button
            key={command}
            type="button"
            className="icon-button"
            aria-label={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              ref.current?.focus();
              document.execCommand(command);
              onChange(ref.current?.innerHTML || "");
            }}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-label="Note content"
        aria-multiline="true"
        suppressContentEditableWarning
        className="rich-editor-body"
        onInput={() => onChange(ref.current?.innerHTML || "")}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand(
            "insertText",
            false,
            e.clipboardData.getData("text/plain"),
          );
          onChange(ref.current?.innerHTML || "");
        }}
      />
    </div>
  );
}
