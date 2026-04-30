import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { UsersTable } from "@/components/users/UsersTable";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Utilisateurs",
};

interface UsersPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const pageSize = 20;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nom: true,
        email: true,
        role: true,
        actif: true,
        createdAt: true,
      },
    }),
    prisma.user.count(),
  ]);

  const serialized = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Utilisateurs</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Gérez les comptes utilisateurs du point de vente.
          </p>
        </div>
        <Link
          href="/users/nouveau"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Nouvel utilisateur
        </Link>
      </div>

      <UsersTable
        initialUsers={serialized}
        totalUsers={total}
        page={page}
        pageSize={pageSize}
      />
    </div>
  );
}
