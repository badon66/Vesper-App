import { REHEARSAL_WORDS } from "./rehearsal";

// The rehearsal's loading screen: its gold bar at once, over plain navy,
// like meeting mode's own. Shown on the way in and while another lead loads.
export default function RehearsalLoading() {
  return (
    <div className="dark fixed inset-0 z-50 flex flex-col bg-background text-foreground" data-loading-screen aria-busy="true">
      <div className="shrink-0 bg-primary pt-[env(safe-area-inset-top)] text-primary-foreground">
        <p className="flex min-h-14 items-center px-4 text-base font-bold">{REHEARSAL_WORDS.bar}</p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <p role="status" className="text-[20px] text-muted-foreground">
          {REHEARSAL_WORDS.opening}
        </p>
      </div>
    </div>
  );
}
