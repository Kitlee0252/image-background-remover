import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-gray-900">
          BG Remover
        </Link>
        <nav>
          <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Privacy
          </Link>
        </nav>
      </div>
    </header>
  );
}
