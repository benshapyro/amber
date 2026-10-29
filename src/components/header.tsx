import Link from "next/link";

export function Header({ current }: { current: "inbox" | "settings" }) {
  const link = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={active ? "text-primary" : "text-muted-foreground transition-colors hover:text-foreground"}
    >
      {label}
    </Link>
  );
  return (
    <header className="mx-auto flex max-w-6xl items-baseline justify-between px-5 pt-8 pb-6 md:px-8">
      <Link href="/" className="font-serif text-3xl font-medium tracking-wide text-primary">
        Amber
      </Link>
      <nav className="flex gap-6 text-sm">
        {link("/", "Inbox", current === "inbox")}
        {link("/settings", "Settings", current === "settings")}
      </nav>
    </header>
  );
}
