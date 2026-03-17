import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "Image Background Remover - Remove Background from Images Online",
  description:
    "Remove background from images instantly online. Upload your photo, erase the background, and download a transparent PNG in seconds.",
  keywords: [
    "image background remover",
    "remove background from image",
    "background remover online",
    "transparent background maker",
    "remove image background online",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
