"use client";

import { useState } from "react";
import { exportBackup, restoreBackup } from "@/lib/backup-db";
import styles from "./backup-panel.module.css";

// Download or restore the whole library as one JSON file. Browser storage can be
// cleared or lost, so this is the only copy of the work that lives outside it.
export function BackupPanel({ className }: { className?: string }) {
  const [message, setMessage] = useState("");

  const download = async () => {
    const url = URL.createObjectURL(new Blob([await exportBackup()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `hanzisave-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Backup downloaded.");
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm("Restoring replaces everything currently in the library. Continue?")) return;
    try {
      const { units, known } = await restoreBackup(await file.text());
      setMessage(`Restored ${units} cards and ${known} known items. Reloading…`);
      window.location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Restore failed.");
    }
  };

  return (
    <div className={className}>
      <div className={styles.title}>Backup</div>
      <div className={styles.text}>
        The library lives in this browser only. Download a copy now and then, and restore it here if you ever lose it.
      </div>
      <div className={styles.row}>
        <button className={styles.button} onClick={download}>
          Download backup
        </button>
        <label className={styles.button}>
          Restore from file
          <input
            className={styles.fileInput}
            type="file"
            accept="application/json,.json"
            onChange={(e) => restore(e.target.files?.[0])}
          />
        </label>
      </div>
      {message && <div className={styles.message}>{message}</div>}
    </div>
  );
}
