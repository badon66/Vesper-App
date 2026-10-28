import { VIEW_AS_EXIT_PATH } from "@/lib/view-as";

// The gold bar across the top while the owner views the app as someone else.
// Exit posts to a route handler, the one request allowed while viewing.
export function ViewAsBar({ name, ended }: { name: string; ended: boolean }) {
  return (
    <div role="status" className="bg-primary text-primary-foreground">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4">
        <p className="py-1 text-sm font-semibold">
          {ended ? "View as has ended. Exit to make changes again." : `Viewing as ${name}. Read only.`}
        </p>
        <form method="post" action={VIEW_AS_EXIT_PATH}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-bold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
          >
            Exit
          </button>
        </form>
      </div>
    </div>
  );
}
