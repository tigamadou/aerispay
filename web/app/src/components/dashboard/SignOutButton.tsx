"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/login" })}
      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      Déconnexion
    </button>
  );
}
