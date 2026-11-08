// A plain phone outline (round 7), in its own units: the body and the edge
// of its screen, nothing on it. Pure; no React.
//
// CONTRACT
//   PHONE_VIEW     [0, 0, 80, 160], about a phone's real shape
//   PHONE_BODY     { x, y, width, height, rx } of the body
//   PHONE_SCREEN   the same for the screen's edge, inset

export const PHONE_VIEW = [0, 0, 80, 160] as const;
export const PHONE_BODY = { x: 4, y: 4, width: 72, height: 152, rx: 12 } as const;
export const PHONE_SCREEN = { x: 8.5, y: 8.5, width: 63, height: 143, rx: 8 } as const;
