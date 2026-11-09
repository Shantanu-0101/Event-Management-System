"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon } from "lucide-react";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Item = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const URL = "/api/v1/me/notifications";
const POLL_MS = 60_000;

async function post(body: object): Promise<number | null> {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { unread: number }).unread;
}

/**
 * The header's bell. The count comes from the server with the page, and is checked
 * again each minute while the tab is showing; the list loads when the menu opens.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);

  // A refreshed page brings a fresher count from the server.
  const [lastInitial, setLastInitial] = useState(initialUnread);
  if (lastInitial !== initialUnread) {
    setLastInitial(initialUnread);
    setUnread(initialUnread);
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(URL, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { unread: number; items: Item[] };
      setUnread(data.unread);
      setItems(data.items);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function open(item: Item) {
    if (item.link) router.push(item.link);
    if (item.readAt) return;
    setItems(
      (list) =>
        list?.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i)) ??
        null,
    );
    const left = await post({ id: item.id });
    if (left !== null) setUnread(left);
  }

  async function markAllRead() {
    const now = new Date().toISOString();
    setItems((list) => list?.map((i) => ({ ...i, readAt: i.readAt ?? now })) ?? null);
    const left = await post({ all: true });
    if (left !== null) setUnread(left);
  }

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <DropdownMenu onOpenChange={(isOpen) => isOpen && void load()}>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="relative" aria-label={label} />}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-medium text-primary-foreground"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-sm font-medium text-foreground">Notifications</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {failed && items === null ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              Couldn&apos;t load these. Try again in a moment.
            </p>
          ) : items === null ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => void open(item)}
                className="grid items-start gap-0.5 whitespace-normal"
              >
                <span
                  className={cn(
                    "text-sm break-words",
                    item.readAt ? "text-muted-foreground" : "font-medium",
                  )}
                >
                  {item.title}
                </span>
                <span className="line-clamp-2 text-xs break-words text-muted-foreground">
                  {item.body}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(new Date(item.createdAt))}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
