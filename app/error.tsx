"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login-page">
      <div className="login-card">
        <h1>Workspace temporarily unavailable</h1>
        <p>
          We could not connect to your workspace. Check the application and
          database health, then retry.
        </p>
        <button className="button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
