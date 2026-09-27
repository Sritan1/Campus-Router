"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="shell">
      <div className="fatal">
        <h1 className="fatal-title">Something went wrong</h1>
        <p className="fatal-body">
          An unexpected error stopped this page from loading. Trying again
          reloads it without losing the rest of the site.
        </p>
        {/* only the person running it can use this, so visitors never see it */}
        {process.env.NODE_ENV === "development" ? (
          <p className="fatal-body">
            <code>{error.message}</code>
          </p>
        ) : null}
        <button type="button" className="primary" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
