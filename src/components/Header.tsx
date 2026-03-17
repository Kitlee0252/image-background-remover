"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import LoginButton from "./LoginButton";
import UserMenu from "./UserMenu";

export default function Header() {
  const { status } = useSession();

  return (
    <header className="border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-gray-900">
          BG Remover
        </Link>
        <div className="flex items-center gap-4">
          <nav>
            <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Privacy
            </Link>
          </nav>
          {status === "authenticated" && <UserMenu />}
          {status === "unauthenticated" && <LoginButton />}
        </div>
      </div>
    </header>
  );
}
