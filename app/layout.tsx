import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

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
      <body className={`${geistSans.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
