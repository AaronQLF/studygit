import type { Metadata } from "next";
import { Inter } from "next/font/google";
// `katex.min.css` and `tippy.css` are only needed by the canvas (math
// blocks in TipTap, tippy popovers for slash/citation menus). They used
// to live here, which forced the marketing landing page to ship ~30 KB
// of CSS + a font fetch it never uses. Imported inside AppShell now.
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "personalGIt",
  description: "Your personal learning canvas",
};

// Runs before React hydration. Reads the stored theme preference (or falls
// back to the system color scheme) and toggles the `dark`/`light` class on
// <html> so styling is correct on first paint with no flash. The matching
// React component is `ThemeToggle`.
const themeInitScript = `(function(){try{var k='personalgit-theme';var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'&&t!=='system'){t='system';}var resolved=t==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;var root=document.documentElement;root.classList.remove('dark');root.classList.remove('light');root.classList.add(resolved);root.dataset.themePref=t;root.style.colorScheme=resolved;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full flex flex-col bg-[var(--pg-bg)] text-[var(--pg-fg)]">
        {children}
      </body>
    </html>
  );
}
