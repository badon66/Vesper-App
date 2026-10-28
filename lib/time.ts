// Every time in the app is shown in Calgary time, whatever the device says.
export const APP_TIME_ZONE = "America/Edmonton";

const dateTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const time = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDate = (iso: string) => date.format(new Date(iso));
