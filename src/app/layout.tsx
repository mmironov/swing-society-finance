import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Nav } from "@/components/nav";
import { isDemoData } from "@/services/app-meta";

import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Swing Society Finance",
  description: "Financial dashboard and season planner for Swing Society",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemoData();

  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        {demo && (
          <p className="bg-warn-soft px-4 py-1.5 text-center text-xs text-warn">
            Demo data — every figure below is fictional. Run{" "}
            <code className="font-mono">npm run db:seed</code> to reset it.
          </p>
        )}
        <Nav />
        <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
