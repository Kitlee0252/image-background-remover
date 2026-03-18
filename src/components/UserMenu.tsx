"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

interface AccountData {
  used: number;
  limit: number;
  plan: string;
  credits: number;
}

export default function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<AccountData | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !account) {
      fetch("/api/account")
        .then((r) => r.json())
        .then((data) => {
          setAccount({
            used: data.usage?.used ?? 0,
            limit: data.usage?.limit ?? 3,
            plan: data.plan ?? "free",
            credits: data.credits ?? 0,
          });
        })
        .catch(() => {});
    }
  }, [open, account]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!session?.user) return null;

  const avatarUrl = session.user.image;
  const name = session.user.name || "User";

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 cursor-pointer rounded-full hover:ring-2 hover:ring-indigo-200 transition-all"
        aria-label="User menu"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            width={32}
            height={32}
            className="rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-semibold">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-2">
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
            <p className="text-xs text-gray-500 truncate">
              {session.user.email}
            </p>
          </div>

          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Monthly Usage</p>
            {account ? (
              <>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700">
                    {account.used} / {account.limit}
                  </span>
                  <span className="text-gray-500 capitalize">
                    {account.plan} plan
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all"
                    style={{
                      width: `${Math.min((account.used / account.limit) * 100, 100)}%`,
                    }}
                  />
                </div>
                {account.credits > 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    {account.credits} credit{account.credits !== 1 ? "s" : ""}{" "}
                    available
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">Loading...</p>
            )}
          </div>

          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Account Settings
          </Link>

          <button
            onClick={() => signOut()}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
