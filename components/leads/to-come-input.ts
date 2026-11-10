// Book now, finish later (Keenan, 2026-11-10): a booking made without a name
// or an address saved "Name to come" or "Address to come" in its place. In
// the edit form, the field selects that placeholder when it is focused or
// tapped, so typing replaces it; left as it is, it stays to come. The tap
// matters on an iPhone: a field focused by the jump from the reminder gets
// no second focus event when it is tapped, and the tap would otherwise put
// the caret after the placeholder.
export function toComeHandlers(placeholder: string | null) {
  if (!placeholder) return {};
  const select = (input: HTMLInputElement) => {
    if (input.value !== placeholder) return;
    // iOS Safari selects only once the focus or the tap has settled.
    window.setTimeout(() => {
      if (input.value === placeholder) input.setSelectionRange(0, input.value.length);
    }, 0);
  };
  return {
    onFocus: (event: React.FocusEvent<HTMLInputElement>) => select(event.currentTarget),
    onClick: (event: React.MouseEvent<HTMLInputElement>) => select(event.currentTarget),
  };
}
