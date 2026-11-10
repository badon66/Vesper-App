// Meeting mode's loading screen: plain navy, nothing internal, no spinner
// clutter in front of a customer.
export default function MeetingLoading() {
  return (
    <div className="dark fixed inset-0 z-50 flex items-center justify-center bg-background text-foreground" data-loading-screen>
      <p className="text-[20px] text-muted-foreground">Opening</p>
    </div>
  );
}
