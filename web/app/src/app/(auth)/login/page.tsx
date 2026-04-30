import { LoginForm } from "./LoginForm";
import { Suspense } from "react";

export const metadata = {
  title: "Connexion | AerisPay",
};

function LoginFormFallback() {
  return (
    <div
      className="h-10 w-full max-w-sm animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800"
      aria-hidden
    />
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
