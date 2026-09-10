import type { Metadata, Viewport } from "next";
import { THEME_STORAGE_KEY } from "@/lib/theme/resolve-theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "PackagePulse",
  description:
    "Live health evidence for PyPI and npm dependencies: vulnerabilities, release activity, repository status and supply-chain checks in one place.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f14" },
  ],
};

// Applies the stored theme before first paint, so the page never flashes.
const themeScript = `(()=>{try{const s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});const d=matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=s==="light"||s==="dark"?s:(d?"dark":"light")}catch{}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
