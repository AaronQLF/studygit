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
  title: "Studygit",
  description: "Your personal learning canvas",
};

// Runs before React hydration. Reads the stored theme preference and the
// chosen palette preset (Paper, Slate, …) plus any accent override, and
// applies them on <html> so the first paint is correct with no flash.
// The matching React components are `ThemeToggle` and
// `ThemeSettingsDialog`.
const themeInitScript = `(function(){
  try {
    var root = document.documentElement;
    var t = localStorage.getItem('studygit-theme');
    if (t !== 'light' && t !== 'dark' && t !== 'system') t = 'system';
    var resolved = t === 'system'
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : t;
    root.classList.remove('dark');
    root.classList.remove('light');
    root.classList.add(resolved);
    root.dataset.themePref = t;
    root.style.colorScheme = resolved;
    var preset = localStorage.getItem('studygit-theme-preset');
    var valid = ['paper','slate','midnight','mocha','forest','ink','plum','sakura','retro','ocean','sunset','solarized','graphite','lavender'];
    if (valid.indexOf(preset) < 0) preset = 'paper';
    root.dataset.themePreset = preset;
    var font = localStorage.getItem('studygit-font-preset');
    var fonts = ['fraunces','literata','newsreader','lora','inter','mono'];
    if (fonts.indexOf(font) < 0) font = 'fraunces';
    root.dataset.fontPreset = font;
    var acc = localStorage.getItem('studygit-accent-override');
    if (acc && /^#[0-9a-f]{6}$/i.test(acc)) {
      root.style.setProperty('--pg-accent', acc);
      root.style.setProperty('--pg-accent-soft', 'color-mix(in srgb, ' + acc + ' 12%, transparent)');
      root.dataset.accentOverride = acc;
    }
  } catch (e) {}
})();`;

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
