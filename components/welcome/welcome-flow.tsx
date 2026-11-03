"use client";

import { CircleCheck, Share } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { saveThisDevice } from "@/app/(app)/app/notifications/actions";
import { finishWelcome } from "@/app/(app)/app/welcome/actions";
import { Button } from "@/components/ui/button";
import { BLOCKED_MESSAGE, isStandalone, readPushState, turnOnPush, unblockSteps } from "@/lib/push/browser";
import { cn } from "@/lib/utils";
import { platformOf, WELCOME_STEPS, welcomeHref, type Platform } from "@/lib/welcome";

// A setter's first sign-in (Keenan, 2026-11-03; shaped in
// .impeccable/shape/2026-11-03__setter-welcome.md). One step per screen:
// the home screen, location, notifications, then how a door goes. Each step
// reads what this phone actually says and can be skipped; Back and Next are
// links, so Keenan can page through it with View as. Only Skip the welcome
// and Done write anything, and only from a tap.

type Props = {
  step: number;
  firstName: string;
  publicKey: string | null;
  deviceHashes: string[];
  readOnly: boolean;
};

export function WelcomeFlow({ step, firstName, publicKey, deviceHashes, readOnly }: Props) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = WELCOME_STEPS[step - 1].key;
  const last = step === WELCOME_STEPS.length;

  // Each new step announces itself; the first one is the page's own.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const markDone = useCallback(
    (stepKey: string, value: boolean) => setDone((now) => (now[stepKey] === value ? now : { ...now, [stepKey]: value })),
    [],
  );
  const homeDone = useCallback((value: boolean) => markDone("home", value), [markDone]);
  const locationDone = useCallback((value: boolean) => markDone("location", value), [markDone]);
  const pushDone = useCallback((value: boolean) => markDone("notifications", value), [markDone]);

  // Stays on "One moment" until Home opens; on a failure it says why and
  // the buttons work again.
  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      const result = await finishWelcome();
      if (!result.ok) {
        setError(result.message);
        setFinishing(false);
        return;
      }
      router.replace("/app");
      router.refresh();
    } catch {
      setError("That didn't save. Check your signal and try again.");
      setFinishing(false);
    }
  }

  const titles: Record<string, string> = {
    home: "Add Vesper to your home screen",
    location: "Allow location",
    notifications: "Turn on notifications",
    tour: "How a door goes",
  };
  // Next once the step is done here; until then the honest word is Skip.
  const ready = Boolean(done[key]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 pb-36" data-testid="welcome" data-step={key}>
      <Progress step={step} />

      <div className="flex flex-col gap-2">
        {step === 1 ? (
          <p className="text-sm font-semibold text-muted-foreground" data-testid="welcome-greeting">
            Welcome, {firstName}
          </p>
        ) : null}
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-balance outline-none" data-testid="welcome-title">
          {titles[key]}
        </h1>
      </div>

      {key === "home" ? <HomeScreenStep readOnly={readOnly} onDone={homeDone} /> : null}
      {key === "location" ? <LocationStep readOnly={readOnly} onDone={locationDone} /> : null}
      {key === "notifications" ? (
        <NotificationsStep publicKey={publicKey} deviceHashes={deviceHashes} readOnly={readOnly} onDone={pushDone} />
      ) : null}
      {key === "tour" ? <TourStep /> : null}

      {/* ------------------------------------------------ bottom: always there, Next at the bottom right */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:left-20">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
          {error ? (
            <p role="alert" className="text-sm font-semibold text-destructive" data-testid="welcome-error">
              {error}
            </p>
          ) : null}
          <div className="flex min-h-11 items-center">
            {last ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={finishing}
                onClick={() => void finish()}
                data-testid="welcome-skip-all"
              >
                {finishing ? "One moment" : "Skip the welcome"}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {step > 1 ? (
              <Button asChild variant="outline" size="lg">
                <Link href={welcomeHref(step - 1)} data-testid="welcome-back">
                  Back
                </Link>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="lg" disabled>
                Back
              </Button>
            )}
            {last ? (
              <Button type="button" size="lg" disabled={finishing} onClick={() => void finish()} data-testid="welcome-done">
                {finishing ? "One moment" : "Done"}
              </Button>
            ) : (
              <Button asChild size="lg" variant={ready ? "default" : "outline"}>
                <Link href={welcomeHref(step + 1)} data-testid="welcome-next">
                  {ready ? "Next" : "Skip this step"}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Progress({ step }: { step: number }) {
  const current = WELCOME_STEPS[step - 1];
  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label="Welcome steps"
        aria-valuemin={1}
        aria-valuemax={WELCOME_STEPS.length}
        aria-valuenow={step}
        aria-valuetext={`Step ${step} of ${WELCOME_STEPS.length}: ${current.label}`}
        className="grid grid-cols-4 gap-2"
      >
        {WELCOME_STEPS.map((item, index) => (
          <span key={item.key} className="relative block h-1 overflow-hidden rounded-full bg-input" aria-hidden="true">
            <span className={cn("absolute inset-0 rounded-full bg-foreground", index < step ? "w-full" : "w-0")} />
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground" aria-hidden="true">
        Step {step} of {WELCOME_STEPS.length}
      </p>
    </div>
  );
}

function Done({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <p className="flex items-start gap-2 text-base font-semibold text-pretty" data-testid={testId}>
      <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Why({ children }: { children: React.ReactNode }) {
  return <p className="text-base text-pretty text-muted-foreground">{children}</p>;
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-3" data-testid="welcome-how">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3 text-base">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold tabular-nums"
          >
            {index + 1}
          </span>
          <span className="pt-0.5 text-pretty">{item}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- 1. home screen

// Opened from the home screen, or which phone's steps to show. Read from the
// browser after it loads; the server draws "Checking this phone."
function subscribeDisplayMode(changed: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}
const homeScreenNow = (): "installed" | Platform =>
  isStandalone() ? "installed" : platformOf(navigator.userAgent, navigator.maxTouchPoints);
const homeScreenOnServer = (): "checking" => "checking";

function HomeScreenStep({ readOnly, onDone }: { readOnly: boolean; onDone: (done: boolean) => void }) {
  const where = useSyncExternalStore(subscribeDisplayMode, homeScreenNow, homeScreenOnServer);

  useEffect(() => {
    if (!readOnly) onDone(where === "installed");
  }, [readOnly, where, onDone]);

  const shown = readOnly ? "iphone" : where;
  return (
    <div className="flex flex-col gap-5">
      <Why>
        Vesper then opens like an app, and on iPhone that&apos;s what lets it send you notifications. Three quick
        things, then how a door goes. Skip anything you like; the bell at the top opens this again.
      </Why>
      {/* What this phone needs: it differs from phone to phone. */}
      <div data-device className="flex flex-col gap-5">
        {shown === "checking" ? <p className="text-muted-foreground">Checking this phone.</p> : null}
        {shown === "installed" ? (
          <Done testId="welcome-home-done">Vesper is on your home screen, and you&apos;re in it now.</Done>
        ) : null}
        {shown === "iphone" || shown === "iphone-other-browser" ? (
          <Steps
            items={[
              shown === "iphone-other-browser" ? (
                <>
                  Tap <strong>Share</strong> <Share aria-hidden="true" className="inline size-4 align-[-2px]" /> in
                  the address bar.
                </>
              ) : (
                <>
                  In Safari, tap <strong>Share</strong>{" "}
                  <Share aria-hidden="true" className="inline size-4 align-[-2px]" />. If you don&apos;t see it at
                  the bottom, tap the three dots first.
                </>
              ),
              <>
                Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>. You may need to scroll down to find
                it.
              </>,
              <>
                Open Vesper from its new icon. If it asks, sign in with the same password. The welcome picks up there.
              </>,
            ]}
          />
        ) : null}
        {shown === "android" ? (
          <Steps
            items={[
              <>In Chrome, tap the three dots at the top right.</>,
              <>
                Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>, then <strong>Install</strong>.
              </>,
              <>Open Vesper from its new icon. The welcome picks up there.</>,
            ]}
          />
        ) : null}
        {shown === "computer" ? (
          <p className="text-base text-pretty">
            Do this on the phone you knock with: open Vesper in Safari on an iPhone, or Chrome on Android, and add it
            to the home screen from there.
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 2. location

type LocationState = "checking" | "ask" | "asking" | "allowed" | "blocked" | "none";

function LocationStep({ readOnly, onDone }: { readOnly: boolean; onDone: (done: boolean) => void }) {
  const [state, setState] = useState<LocationState>("checking");

  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    async function check() {
      if (!("geolocation" in navigator)) return setState("none");
      try {
        const status = await navigator.permissions?.query({ name: "geolocation" });
        if (cancelled) return;
        setState(status?.state === "granted" ? "allowed" : status?.state === "denied" ? "blocked" : "ask");
      } catch {
        if (!cancelled) setState("ask");
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [readOnly]);

  useEffect(() => onDone(state === "allowed"), [state, onDone]);

  function ask() {
    setState("asking");
    navigator.geolocation.getCurrentPosition(
      () => setState("allowed"),
      // Allowed but no fix yet (indoors, or slow) still counts as allowed.
      (problem) => setState(problem.code === problem.PERMISSION_DENIED ? "blocked" : "allowed"),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 },
    );
  }

  const shown = readOnly ? "ask" : state;
  return (
    <div className="flex flex-col gap-5">
      <Why>
        At a door on a new street that isn&apos;t on the map yet, <strong className="text-foreground">Use where I&apos;m standing</strong>{" "}
        puts the lead on the map from where you are. Vesper checks your location only when you tap it.
      </Why>
      <div aria-live="polite" data-device className="flex flex-col gap-3">
        {shown === "checking" ? <p className="text-muted-foreground">Checking this phone.</p> : null}
        {shown === "ask" || shown === "asking" ? (
          <>
            <Button type="button" size="lg" className="self-start" disabled={shown === "asking"} onClick={ask} data-testid="welcome-allow-location">
              {shown === "asking" ? "Asking" : "Allow location"}
            </Button>
            <p className="text-sm text-pretty text-muted-foreground">Your phone asks once. Choose Allow.</p>
          </>
        ) : null}
        {shown === "allowed" ? <Done testId="welcome-location-done">Location is allowed on this phone.</Done> : null}
        {shown === "blocked" ? (
          <p className="text-base text-pretty" data-testid="welcome-location-blocked">
            Location is blocked for Vesper on this phone. You can allow it later in the phone&apos;s settings;
            everything else works without it.
          </p>
        ) : null}
        {shown === "none" ? <p className="text-base text-pretty">This browser can&apos;t share its location.</p> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 3. notifications

type PushState = "checking" | "not-set-up" | "needs-home-screen" | "unsupported" | "off" | "asking" | "on" | "blocked";

function NotificationsStep({
  publicKey,
  deviceHashes,
  readOnly,
  onDone,
}: {
  publicKey: string | null;
  deviceHashes: string[];
  readOnly: boolean;
  onDone: (done: boolean) => void;
}) {
  const [state, setState] = useState<PushState>(publicKey ? "checking" : "not-set-up");
  const [message, setMessage] = useState<string | null>(null);
  const hashKey = deviceHashes.join(",");

  // What this phone says now: on load, and again from Check again.
  const apply = useCallback((found: { support: string; permission: NotificationPermission | null; on: boolean }) => {
    if (found.support !== "ready") setState(found.support === "needs_home_screen" ? "needs-home-screen" : "unsupported");
    else setState(found.permission === "denied" ? "blocked" : found.on ? "on" : "off");
  }, []);
  const hashList = useCallback(() => (hashKey ? hashKey.split(",") : []), [hashKey]);
  function check() {
    void readPushState(hashList()).then(apply, () => setState("unsupported"));
  }

  useEffect(() => {
    if (readOnly || !publicKey) return;
    let cancelled = false;
    readPushState(hashList()).then(
      (found) => {
        if (!cancelled) apply(found);
      },
      () => {
        if (!cancelled) setState("unsupported");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [readOnly, publicKey, hashList, apply]);

  useEffect(() => onDone(state === "on"), [state, onDone]);

  async function turnOn() {
    if (!publicKey) return;
    setState("asking");
    setMessage(null);
    try {
      const result = await turnOnPush(publicKey, saveThisDevice);
      if (result.ok) return setState("on");
      setState(result.blocked ? "blocked" : "off");
      if (!result.blocked) setMessage(result.message);
    } catch {
      setState("off");
      setMessage("Notifications couldn't be turned on here. Check your signal and try again.");
    }
  }

  const shown = readOnly ? (publicKey ? "off" : "not-set-up") : state;
  return (
    <div className="flex flex-col gap-5">
      <Why>
        You&apos;ll hear when Keenan marks one of your bookings, or moves or cancels it. A notice names the street only,
        never the house number or the customer, because it shows on your lock screen.
      </Why>
      <div aria-live="polite" data-device className="flex flex-col gap-3">
        {shown === "checking" ? <p className="text-muted-foreground">Checking this phone.</p> : null}
        {shown === "not-set-up" ? (
          <p className="text-base text-pretty" data-testid="welcome-push-not-set-up">
            Notifications aren&apos;t set up yet. Keenan turns them on; then switch them on from the bell at the top of
            the app.
          </p>
        ) : null}
        {shown === "needs-home-screen" ? (
          <p className="text-base text-pretty">
            On iPhone, notifications work only from the Vesper icon on your home screen.{" "}
            <Link href={welcomeHref(1)} className="font-semibold underline underline-offset-4">
              Add it first
            </Link>
            , then turn them on here.
          </p>
        ) : null}
        {shown === "unsupported" ? (
          <p className="text-base text-pretty">This browser can&apos;t take notifications. Turn them on from Vesper on your phone.</p>
        ) : null}
        {shown === "off" || shown === "asking" ? (
          <>
            <Button type="button" size="lg" className="self-start" disabled={shown === "asking"} onClick={() => void turnOn()} data-testid="welcome-turn-on">
              {shown === "asking" ? "Asking" : "Turn on notifications"}
            </Button>
            <p className="text-sm text-pretty text-muted-foreground">Your phone asks once. Choose Allow.</p>
          </>
        ) : null}
        {shown === "on" ? <Done testId="welcome-push-done">Notifications are on for this phone.</Done> : null}
        {shown === "blocked" ? (
          <>
            <p className="text-base font-semibold text-pretty">{BLOCKED_MESSAGE}</p>
            <p className="text-sm text-pretty text-muted-foreground">{unblockSteps()}</p>
            <Button type="button" variant="outline" size="lg" className="self-start" onClick={check}>
              Check again
            </Button>
          </>
        ) : null}
        {message ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 4. how a door goes

function TourStep() {
  return (
    <div className="flex flex-col gap-5" data-testid="welcome-tour">
      <Why>Three things, in the order you&apos;ll use them.</Why>
      <Steps
        items={[
          <>
            <strong>Start knocking on Home.</strong> Name the neighbourhood, then count Doors and Conversations as you
            go. Leads you add while it runs link to it.
          </>,
          <>
            <strong>Pick a time on Schedule.</strong> Tapping an open time holds it for you. Everyone else sees your
            initials on it until you book it or let it go.
          </>,
          <>
            <strong>Book it in the sheet.</strong> At the door, After the door, then Book. The ? on each step has
            Keenan&apos;s notes for it.
          </>,
        ]}
      />
    </div>
  );
}
