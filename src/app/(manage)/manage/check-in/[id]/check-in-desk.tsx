"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CircleAlertIcon, CircleCheckIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
import {
  looksLikeTicketCode,
  normalizeTicketCode,
  percent,
  type CheckInCounts,
  type CheckInErrorCode,
  type CheckInPerson,
} from "@/lib/check-in";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrScanner } from "./qr-scanner";

const COUNTER_REFRESH_MS = 5_000;
// A ticket stays in view after its scan. Reading it again would turn a good check-in
// into a confusing "already checked in", so a code must be gone this long to count again.
const SAME_CODE_PAUSE_MS = 5_000;

type Result =
  | { kind: "success"; person: CheckInPerson }
  | { kind: "already"; person: CheckInPerson }
  | { kind: "refused"; message: string }
  | { kind: "undone"; name: string };

type CheckInResponse = {
  person?: CheckInPerson;
  counts?: CheckInCounts;
  error?: { code: CheckInErrorCode | string; message: string };
};

const NO_CONNECTION = "Couldn't reach the server. Check your connection and try again.";

async function send(url: string, init?: RequestInit): Promise<CheckInResponse> {
  const response = await fetch(url, init);
  // Anything but our JSON (a proxy's error page, say) counts as not getting through.
  return (await response.json()) as CheckInResponse;
}

function buzz(pattern: number | number[]) {
  // Not every phone has this; the colours and icons say the same thing.
  navigator.vibrate?.(pattern);
}

/** Scanner, manual search and the live counter for one event. */
export function CheckInDesk({
  eventId,
  initialCounts,
}: {
  eventId: string;
  initialCounts: CheckInCounts;
}) {
  const [counts, setCounts] = useState(initialCounts);
  const [result, setResult] = useState<Result | null>(null);
  const api = `/api/v1/events/${eventId}/checkin`;

  // The counter keeps up with other coordinators' phones. It stops while the page
  // is in the background, and catches up as soon as it's back.
  useEffect(() => {
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const latest = (await send(api)) as Partial<CheckInCounts> & CheckInResponse;
        if (typeof latest.registered === "number" && typeof latest.checkedIn === "number") {
          setCounts({ registered: latest.registered, checkedIn: latest.checkedIn });
        }
      } catch {
        // Offline for a moment: keep the last numbers and try again on the next tick.
      }
    };
    const timer = setInterval(refresh, COUNTER_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [api]);

  const submit = useCallback(
    async (target: { ticketCode: string } | { registrationId: string }): Promise<Result> => {
      let next: Result;
      try {
        const data = await send(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target),
        });
        if (data.counts) setCounts(data.counts);

        if (data.person && !data.error) next = { kind: "success", person: data.person };
        else if (data.error?.code === "ALREADY_CHECKED_IN" && data.person) {
          next = { kind: "already", person: data.person };
        } else next = { kind: "refused", message: data.error?.message ?? NO_CONNECTION };
      } catch {
        next = { kind: "refused", message: NO_CONNECTION };
      }
      setResult(next);
      buzz(next.kind === "success" ? 100 : [100, 80, 100]);
      return next;
    },
    [api],
  );

  // One request at a time, and no second try at a code that was just read. A failed
  // connection clears the code, so holding the ticket up again retries it.
  const scanning = useRef(false);
  const lastScan = useRef({ code: "", at: 0 });
  const onScan = useCallback(
    async (raw: string) => {
      const code = normalizeTicketCode(raw);
      const now = Date.now();
      if (scanning.current) return;
      if (code === lastScan.current.code && now - lastScan.current.at < SAME_CODE_PAUSE_MS) {
        // Still in view, so the pause starts again: it only reads once it has left the frame.
        lastScan.current.at = now;
        return;
      }

      scanning.current = true;
      lastScan.current = { code, at: now };
      const outcome = await submit({ ticketCode: raw });
      if (outcome.kind === "refused" && outcome.message === NO_CONNECTION) {
        lastScan.current = { code: "", at: 0 };
      }
      scanning.current = false;
    },
    [submit],
  );

  const undo = useCallback(
    async (person: CheckInPerson): Promise<Result> => {
      let next: Result;
      try {
        const data = await send(`${api}/${person.registrationId}`, { method: "DELETE" });
        if (data.counts) setCounts(data.counts);
        next = data.error
          ? { kind: "refused", message: data.error.message }
          : { kind: "undone", name: person.name };
        // They may be standing right there with the ticket: let it scan again.
        lastScan.current = { code: "", at: 0 };
      } catch {
        next = { kind: "refused", message: NO_CONNECTION };
      }
      setResult(next);
      return next;
    },
    [api],
  );

  return (
    <div className="grid gap-4">
      <Counter counts={counts} />
      {result && <ResultCard result={result} onUndo={undo} />}
      <QrScanner onCode={onScan} />
      <ManualSearch api={api} onCheckIn={submit} onUndo={undo} />
    </div>
  );
}

function Counter({ counts: { registered, checkedIn } }: { counts: CheckInCounts }) {
  const share = percent(checkedIn, registered) ?? 0;
  return (
    <section aria-label="Attendance so far" className="grid gap-2 rounded-xl border p-4">
      <p className="flex items-baseline justify-between gap-2">
        <span>
          <span className="text-3xl font-semibold" data-testid="checked-in-count">
            {checkedIn}
          </span>
          <span className="text-muted-foreground"> of {registered} checked in</span>
        </span>
        <span className="text-sm text-muted-foreground">{share}%</span>
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${share}%` }}
        />
      </div>
    </section>
  );
}

function PersonLine({ person }: { person: CheckInPerson }) {
  const details = [
    person.rollNo,
    person.department,
    person.year ? `Year ${person.year}` : null,
  ].filter(Boolean);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-14 shrink-0">
        {person.photoUrl && <AvatarImage src={person.photoUrl} alt="" />}
        <AvatarFallback>{person.name.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-lg leading-tight font-semibold break-words">{person.name}</p>
        {details.length > 0 && <p className="text-sm break-words">{details.join(" · ")}</p>}
        {person.team && <p className="text-sm break-words">Team {person.team}</p>}
      </div>
    </div>
  );
}

const CARD_STYLES = {
  success: "border-emerald-600 bg-emerald-50 dark:bg-emerald-950",
  warning: "border-amber-500 bg-amber-50 dark:bg-amber-950",
  danger: "border-destructive bg-destructive/10",
  neutral: "bg-muted",
};

function ResultCard({
  result,
  onUndo,
}: {
  result: Result;
  onUndo: (person: CheckInPerson) => void;
}) {
  const shell = (style: keyof typeof CARD_STYLES, content: React.ReactNode) => (
    <div role="status" className={cn("grid gap-3 rounded-xl border-2 p-4", CARD_STYLES[style])}>
      {content}
    </div>
  );

  switch (result.kind) {
    case "success":
      return shell(
        "success",
        <>
          <p className="flex items-center gap-2 font-semibold">
            <CircleCheckIcon className="size-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
            Checked in
          </p>
          <PersonLine person={result.person} />
          <div>
            <Button variant="outline" size="sm" onClick={() => onUndo(result.person)}>
              Undo
            </Button>
          </div>
        </>,
      );
    case "already":
      return shell(
        "warning",
        <>
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlertIcon className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            Already checked in
            {result.person.checkedInAt && ` at ${formatTime(new Date(result.person.checkedInAt))}`}
          </p>
          <PersonLine person={result.person} />
          {result.person.checkedInBy && (
            <p className="text-sm">By {result.person.checkedInBy}. Don&apos;t let them in twice.</p>
          )}
        </>,
      );
    case "refused":
      return shell(
        "danger",
        <p className="flex items-start gap-2 font-semibold">
          <CircleAlertIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
          {result.message}
        </p>,
      );
    case "undone":
      return shell("neutral", <p className="font-medium">Check-in undone for {result.name}.</p>);
  }
}

function ManualSearch({
  api,
  onCheckIn,
  onUndo,
}: {
  api: string;
  onCheckIn: (target: { registrationId: string } | { ticketCode: string }) => Promise<Result>;
  onUndo: (person: CheckInPerson) => Promise<Result>;
}) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<CheckInPerson[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function search(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setProblem(null);

    startTransition(async () => {
      if (looksLikeTicketCode(q)) {
        const outcome = await onCheckIn({ ticketCode: q });
        // A mistyped code stays in the box, ready to correct.
        if (outcome.kind !== "refused") setQuery("");
        setPeople(null);
        return;
      }
      try {
        const response = await fetch(`${api}/search?q=${encodeURIComponent(q)}`);
        const data = (await response.json()) as { people?: CheckInPerson[] };
        setPeople(data.people ?? []);
      } catch {
        setProblem(NO_CONNECTION);
      }
    });
  }

  async function checkInPerson(person: CheckInPerson) {
    const outcome = await onCheckIn({ registrationId: person.registrationId });
    if (outcome.kind !== "success" && outcome.kind !== "already") return;
    replacePerson(outcome.person);
  }

  async function undoPerson(person: CheckInPerson) {
    const outcome = await onUndo(person);
    if (outcome.kind === "undone") {
      replacePerson({ ...person, checkedInAt: null, checkedInBy: null });
    }
  }

  function replacePerson(updated: CheckInPerson) {
    setPeople((list) =>
      list ? list.map((p) => (p.registrationId === updated.registrationId ? updated : p)) : list,
    );
  }

  return (
    <section aria-label="Search" className="grid gap-3 border-t pt-4">
      <form onSubmit={search} className="grid gap-2">
        <label htmlFor="check-in-search" className="text-sm font-medium">
          Can&apos;t scan? Search by name, roll number, team or ticket code
        </label>
        <div className="flex gap-2">
          <Input
            id="check-in-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
            className="h-11 flex-1"
          />
          <Button type="submit" variant="secondary" className="h-11" disabled={pending}>
            <SearchIcon data-icon="inline-start" /> Find
          </Button>
        </div>
      </form>

      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {people?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nobody registered matches. People on the waitlist can&apos;t be checked in.
        </p>
      )}
      {people && people.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {people.map((person) => (
            <li
              key={person.registrationId}
              className="flex items-center justify-between gap-3 p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium break-words">{person.name}</p>
                <p className="text-xs break-words text-muted-foreground">
                  {[person.rollNo, person.team && `Team ${person.team}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {person.checkedInAt ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="secondary">
                    In at {formatTime(new Date(person.checkedInAt))}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => undoPerson(person)}>
                    Undo
                  </Button>
                </div>
              ) : (
                <Button size="sm" className="shrink-0" onClick={() => checkInPerson(person)}>
                  Check in
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
