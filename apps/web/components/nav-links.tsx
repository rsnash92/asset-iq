"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/library", label: "Library" },
  { href: "/chat", label: "Chat" },
  { href: "/agent", label: "Agent" },
  { href: "/evals", label: "Evals" },
  { href: "/usage", label: "Usage" },
  { href: "/settings", label: "API keys" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground",
            path.startsWith(l.href) && "bg-muted text-foreground",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
