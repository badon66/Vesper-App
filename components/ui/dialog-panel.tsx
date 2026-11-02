"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

// A pop-up on the browser's own dialog element: it sits above everything,
// including the tab bar and the booking sheet, keeps focus inside and closes
// with Escape. On a phone it is a panel along the bottom, in thumb reach;
// from 640 px wide it is a centred box. Its actions sit at the bottom right.
export function DialogPanel({
  open,
  onClose,
  title,
  children,
  actions,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A tap on the dimmed area around the panel closes it.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-xl border border-b-0 bg-background p-0 text-foreground",
        "backdrop:bg-black/60 sm:m-auto sm:max-w-md sm:rounded-xl sm:border-b",
      )}
    >
      {open ? (
        <div className="flex max-h-[90dvh] flex-col">
          <h2 id={titleId} className="px-5 pt-5 text-lg font-bold text-balance">
            {title}
          </h2>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {actions ? (
            <div className="flex flex-wrap justify-end gap-3 border-t px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
