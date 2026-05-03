import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "katex/dist/katex.min.css";
import "tippy.js/dist/tippy.css";
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
