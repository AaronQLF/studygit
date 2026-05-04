import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--pg-bg)] text-[var(--pg-fg)]">
      <header className="h-12 px-4 flex items-center justify-between border-b border-[var(--pg-border)]">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="pg-serif text-[18px] italic font-medium tracking-tight text-[var(--pg-fg)] group-hover:text-[var(--pg-accent)] transition-colors">
            personalGit
          </span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
