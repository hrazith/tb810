"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export function Dialog({
  open,
  title,
  description,
  onOpenChange,
  children,
  className,
  contentClassName,
  titleClassName,
  descriptionClassName,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }

    if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={joinClasses(
        "m-0 max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[34rem] rounded-2xl border border-zinc-200 bg-white p-0 text-left text-zinc-950 shadow-2xl backdrop:bg-zinc-950/45",
        "fixed inset-0 overflow-hidden",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
      onClose={() => onOpenChange(false)}
    >
      <div
        className={joinClasses(
          "flex max-h-[calc(100vh-2rem)] flex-col gap-6 overflow-y-auto p-6 sm:p-8",
          contentClassName,
        )}
      >
        <div className="space-y-2">
          <h2
            id={titleId}
            className={joinClasses(
              "text-2xl font-semibold tracking-tight",
              titleClassName,
            )}
          >
            {title}
          </h2>
          {description ? (
            <p
              id={descriptionId}
              className={joinClasses("text-sm text-zinc-600", descriptionClassName)}
            >
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </dialog>
  );
}
