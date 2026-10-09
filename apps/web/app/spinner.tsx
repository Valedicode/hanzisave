import styles from "./spinner.module.css";

// A small spinning ring in the text colour, for buttons and status lines that are waiting on something.
export function Spinner({ label }: { label?: string }) {
  return <span className={styles.spinner} role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
