"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./nav-menu.module.css";

const LINKS = [
  { href: "/scan", label: "Scan" },
  { href: "/rewrite", label: "Rewrite deck" },
  { href: "/import", label: "Import" },
  { href: "/analyze", label: "Analyze" },
];

// Links in a row on wide screens; on a phone they sit behind a hamburger button, so none are lost.
export function NavMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav className={styles.nav} aria-label="Main">
      <button
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-controls="main-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`${styles.bar} ${open ? styles.barTop : ""}`} />
        <span className={`${styles.bar} ${open ? styles.barMid : ""}`} />
        <span className={`${styles.bar} ${open ? styles.barBottom : ""}`} />
      </button>

      <ul id="main-menu" className={`${styles.links} ${open ? styles.open : ""}`}>
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
