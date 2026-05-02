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

const themeInitScript = `(function(){try{var k='personalgit-theme';localStorage.setItem(k,'light');var root=document.documentElement;root.classList.remove('dark');root.classList.add('light');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} light h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full flex flex-col bg-[var(--pg-bg)] text-[var(--pg-fg)]">
        {children}
      </body>
    </html>
  );
}
