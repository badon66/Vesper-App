// The shape of a push notice: shared by the sender (server only) and the
// pure wording modules, which must not import the sender.
export type PushNotice = {
  title: string;
  body: string;
  // Where a tap on the notification opens, inside the app.
  url: string;
  // Notices with the same tag replace each other on the device.
  tag?: string;
};
