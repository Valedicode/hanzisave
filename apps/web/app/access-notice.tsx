import Link from "next/link";
import styles from "./access-notice.module.css";

// Shown on any screen when a request is refused because the access code is missing or wrong.
export function AccessNotice() {
  return (
    <div className={styles.notice} role="alert">
      <span>The access code is missing or wrong.</span>{" "}
      <Link href="/#access" className={styles.link}>
        Enter it on the home page
      </Link>
      , then come back and try again.
    </div>
  );
}
