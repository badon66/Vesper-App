// The tracer's loading screen: plain navy, full screen, like the tracer
// itself, so the tap answers at once.
export default function RooflineLoading() {
  return (
    <div className="dark fixed inset-0 z-50 flex items-center justify-center bg-background text-foreground" data-loading-screen aria-busy="true">
      <p role="status" className="text-sm text-muted-foreground">
        Opening the photo
      </p>
    </div>
  );
}
