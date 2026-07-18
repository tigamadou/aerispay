"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h2>Une erreur est survenue</h2>
          <p>{error.message}</p>
          <button onClick={reset}>Réessayer</button>
        </div>
      </body>
    </html>
  );
}
