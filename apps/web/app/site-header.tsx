import Link from "next/link";
import { NavMenu } from "./nav-menu";
import { ThemeToggle } from "./theme-toggle";
import styles from "./site-header.module.css";

// One header for every page: logo and name go to the landing page, the nav and theme toggle stay in reach.
export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="HanziSave home">
          <span className={styles.logo}>汉</span>
          <span className={styles.brandName}>HanziSave</span>
        </Link>
        <div className={styles.actions}>
          <NavMenu />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
