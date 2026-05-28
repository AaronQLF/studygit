"use client";

// Bottom-of-panel composer for the AI conversation: textarea, image
// attachment chips, and the send button. Handles paste / drag-drop /
// file-picker ingest by routing through lib/ai-attachments (which
// resizes + re-encodes each image into a sensible byte budget).

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  ImagePlus,
  Loader2,
  Send,
  Settings,
  TriangleAlert,
  X,
} from "lucide-react";
import { AI_SETTINGS_DIALOG_EVENT } from "@/lib/ai-settings";
import {
  fileToImageAttachment,
  MAX_ATTACHMENTS,
} from "@/lib/ai-attachments";
import type { AiAttachment } from "@/lib/types";

export type AiComposerProps = {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  disabled: boolean;
  credsMissing: boolean;
  attachments: AiAttachment[];
  onAttachmentsChange: (next: AiAttachment[]) => void;
  attachmentError: string | null;
  setAttachmentError: (msg: string | null) => void;
};

export function AiComposer({
  value,
  onChange,
  onSend,
  disabled,
  credsMissing,
  attachments,
  onAttachmentsChange,
  attachmentError,
  setAttachmentError,
}: AiComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [attaching, setAttaching] = useState(false);

  // Auto-resize the textarea up to a generous cap. Keeps single-line
  // questions tight, lets multi-paragraph drafts breathe without
  // requiring an internal scrollbar inside the panel.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(220, el.scrollHeight)}px`;
  }, [value]);

  const canSend =
    !disabled && (value.trim().length > 0 || attachments.length > 0);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  const ingestFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setAttachmentError(null);
      setAttaching(true);
      try {
        const remaining = MAX_ATTACHMENTS - attachments.length;
        if (remaining <= 0) {
          setAttachmentError(
            `Max ${MAX_ATTACHMENTS} images per message — remove one to add another.`
          );
          return;
        }
        const accepted: AiAttachment[] = [];
        for (const file of files.slice(0, remaining)) {
          if (!file.type.startsWith("image/")) continue;
          try {
            const att = await fileToImageAttachment(file);
            accepted.push(att);
          } catch (err) {
            // Surface the first error but keep going so a single bad
            // file doesn't tank the others.
            if (!attachmentError) {
              setAttachmentError(
                `Couldn't attach ${file.name || "image"}: ${
                  (err as Error).message
                }`
              );
            }
          }
        }
        if (accepted.length > 0) {
          onAttachmentsChange([...attachments, ...accepted]);
        }
      } finally {
        setAttaching(false);
      }
    },
    [attachments, attachmentError, onAttachmentsChange, setAttachmentError]
  );

  const onPaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(event.clipboardData.items);
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        event.preventDefault();
        void ingestFiles(imageFiles);
      }
    },
    [ingestFiles]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      const files = Array.from(event.dataTransfer.files ?? []).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files.length > 0) void ingestFiles(files);
    },
    [ingestFiles]
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-5 pt-2 shrink-0">
      {credsMissing ? (
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent(AI_SETTINGS_DIALOG_EVENT))
          }
          className="mb-2 inline-flex h-7 items-center gap-1.5 rounded-[var(--pg-radius)] border border-amber-500/40 px-2.5 text-[12px] text-amber-600 dark:text-amber-400"
        >
          <Settings size={11} />
          Configure an AI provider to send messages
        </button>
      ) : null}
      {attachmentError ? (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-[var(--pg-radius)] border border-red-500/40 px-2.5 py-1 text-[12px] text-red-600 dark:text-red-400">
          <TriangleAlert size={11} />
          {attachmentError}
        </div>
      ) : null}
      <div
        onDragEnter={(event) => {
          if (Array.from(event.dataTransfer.types).includes("Files")) {
            setDragOver(true);
          }
        }}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.types).includes("Files")) {
            event.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={(event) => {
          // Only clear when the drag leaves the entire wrapper, not
          // when it crosses into a child.
          if (event.currentTarget === event.target) setDragOver(false);
        }}
        onDrop={onDrop}
        className={clsx(
          "flex flex-col gap-1.5 rounded-[var(--pg-radius)] border bg-transparent p-1 transition-colors",
          dragOver
            ? "border-[var(--pg-accent)] bg-[color-mix(in_srgb,var(--pg-accent)_8%,transparent)]"
            : disabled
              ? "border-[var(--pg-border)]"
              : "border-[var(--pg-border)] focus-within:border-[var(--pg-border-strong)]"
        )}
      >
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-1 pt-1">
            {attachments.map((att, i) => (
              <AttachmentChip
                key={`${i}-${att.dataUrl.length}`}
                attachment={att}
                onRemove={() =>
                  onAttachmentsChange(attachments.filter((_, j) => j !== i))
                }
              />
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={
              disabled || attaching || attachments.length >= MAX_ATTACHMENTS
            }
            className={clsx(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--pg-radius)] transition-colors",
              disabled || attaching || attachments.length >= MAX_ATTACHMENTS
                ? "text-[var(--pg-muted)]"
                : "text-[var(--pg-muted)] hover:bg-[var(--pg-bg-subtle)] hover:text-[var(--pg-fg)]"
            )}
            title={
              attachments.length >= MAX_ATTACHMENTS
                ? `Max ${MAX_ATTACHMENTS} images per message`
                : "Attach image (or paste / drop)"
            }
          >
            {attaching ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ImagePlus size={13} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              void ingestFiles(files);
              // Reset so picking the same file twice in a row still fires.
              event.target.value = "";
            }}
          />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
            placeholder={
              attachments.length > 0
                ? "Ask about these images… (⇧⏎ for newline)"
                : "Ask a follow-up… (⇧⏎ for newline, paste or drop images)"
            }
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed text-[var(--pg-fg)] outline-none placeholder:text-[var(--pg-muted)]"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className={clsx(
              "inline-flex h-7 w-7 items-center justify-center rounded-[var(--pg-radius)] transition-colors",
              !canSend
                ? "text-[var(--pg-muted)]"
                : "text-[var(--pg-accent)] hover:bg-[var(--pg-bg-subtle)]"
            )}
            title="Send (⏎)"
          >
            {disabled ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: AiAttachment;
  onRemove: () => void;
}) {
  return (
    <div className="group relative inline-flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.dataUrl}
        alt={attachment.name ?? "attached image"}
        className="h-12 w-12 rounded-md border border-[var(--pg-border)] object-cover"
      />
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--pg-bg-elevated)] text-[var(--pg-muted)] opacity-0 shadow-[var(--pg-shadow)] transition-opacity hover:text-[var(--pg-fg)] group-hover:opacity-100"
        title="Remove image"
      >
        <X size={9} />
      </button>
    </div>
  );
}
