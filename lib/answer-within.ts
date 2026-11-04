// How long a save waits for its answer before the screen says there wasn't
// one: the booking sheet since round 2, New lead since 2026-11-04. The
// request may still finish on the server after that, which is why every
// save that can be tried again is safe to try again (a new lead's save key,
// the database's booking rules).
export const ANSWER_WITHIN_MS = 25_000;

export class NoAnswerInTime extends Error {}

// The promise's own answer, or NoAnswerInTime once `within` has passed. A
// late answer is ignored here; whatever it did on the server stands.
export function timed<T>(promise: Promise<T>, within = ANSWER_WITHIN_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new NoAnswerInTime("No answer in time")), within);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
