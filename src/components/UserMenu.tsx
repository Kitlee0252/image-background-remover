"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";

interface UsageData {
  used: number;
  limit: number;
  plan: string;
}

export default function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !usage) {
      fetch("/api/usage")
        .then((r) => r.json())
        .then((data: UsageData) => setUsage(data))
        .catch(() => {});
    }
  }, [open, usage]);

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
            {usage ? (
              <>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700">
                    {usage.used} / {usage.limit}
                  </span>
                  <span className="text-gray-500 capitalize">
                    {usage.plan} plan
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all"
                    style={{
                      width: `${Math.min((usage.used / usage.limit) * 100, 100)}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">Loading...</p>
            )}
          </div>

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
