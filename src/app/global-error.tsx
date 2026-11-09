"use client";

// Replaces the whole page when the root layout itself fails, so it can't use the site's
// styles, fonts or theme. Plain inline styles keep it readable in light and dark.
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en" style={{ colorScheme: "light dark" }}>
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "5rem 1rem" }}>
        <title>Something went wrong · CSMSS Events</title>
        <main style={{ margin: "0 auto", maxWidth: "36rem" }} role="alert">
          <h1 style={{ fontSize: "1.5rem" }}>Something went wrong</h1>
          <p>The site couldn&apos;t load. Try again in a minute.</p>
          <button type="button" onClick={() => retry()} style={{ padding: "0.5rem 1rem" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
