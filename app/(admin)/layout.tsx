import { auth } from "../../auth";
import { isAdmin } from "@/lib/admin";
import { notFound } from "next/navigation";
import AuthProvider from "@/components/AuthProvider";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!isAdmin(session?.user?.email)) {
    notFound();
  }

  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-950 text-white">
        {children}
      </div>
    </AuthProvider>
  );
}
