import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-gray-100 py-8 px-4">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} BG Remover. All rights reserved.</p>
        <Link href="/privacy" className="hover:text-gray-700 transition-colors">
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}
