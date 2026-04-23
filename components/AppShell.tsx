import { APP_NAME } from "@/lib/config";

import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.wordmark} aria-label={APP_NAME}>
          <span className={styles.wordmarkName}>{APP_NAME}</span>
          <span className={styles.wordmarkTag}>LOCAL EVIDENCE SCAN</span>
        </div>
        <p className={styles.headerNote}>
          默认只在浏览器内处理，不做绝对真假断言。
        </p>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <p>v1 仅支持 JPEG / PNG / WebP，本地结果用于核对来源，不替代人工判断。</p>
      </footer>
    </div>
  );
}

