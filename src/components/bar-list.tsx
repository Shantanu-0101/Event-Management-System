export type Bar = {
  label: string;
  /** Length of the bar, on the same scale as `max`. */
  value: number;
  /** The number as shown: every value is printed, so nothing depends on hover or colour. */
  display: string;
};

/**
 * A ranked horizontal bar chart in plain HTML. It renders on the server and is real
 * text and a real list, so a screen reader or a phone with JavaScript off gets it all.
 */
export function BarList({ title, bars, max }: { title: string; bars: Bar[]; max: number }) {
  return (
    <ul aria-label={title} className="grid gap-3">
      {bars.map((bar) => (
        <li key={bar.label} className="grid gap-1 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words">{bar.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{bar.display}</span>
          </div>
          <div className="h-2.5">
            {bar.value > 0 && (
              <div
                className="h-full rounded-r bg-chart-bar"
                style={{ width: `${Math.max(1, (bar.value / max) * 100)}%` }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
