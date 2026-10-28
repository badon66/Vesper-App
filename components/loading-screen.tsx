// What a tab shows the moment it is tapped, while its data is on the way.
// Each tab's loading.tsx uses it; Next.js prefetches it with the tab link,
// so the switch is instant (CLAUDE.md, Navigation).
export function LoadingScreen({ title, blocks = 3 }: { title?: string; blocks?: number }) {
  return (
    <div data-loading-screen aria-busy="true" className="flex flex-col gap-5">
      {title ? <h1 className="text-2xl font-bold">{title}</h1> : <div className="h-8 w-40 rounded-md bg-muted" />}
      <p role="status" className="sr-only">
        Loading
      </p>
      {Array.from({ length: blocks }, (_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted/40" />
      ))}
    </div>
  );
}
