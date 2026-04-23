"use client";

import styles from "./AppealDrawer.module.css";

type Props = {
  isOpen: boolean;
  note: string;
  sourceUrl: string;
  attachmentNames: string[];
  message: string;
  isSubmitting: boolean;
  canSubmitApi: boolean;
  fallbackHref: string;
  fallbackLabel: string;
  onClose: () => void;
  onNoteChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onDownloadDraft: () => void;
  onSubmit: () => Promise<void>;
};

export function AppealDrawer({
  isOpen,
  note,
  sourceUrl,
  attachmentNames,
  message,
  isSubmitting,
  canSubmitApi,
  fallbackHref,
  fallbackLabel,
  onClose,
  onNoteChange,
  onSourceUrlChange,
  onDownloadDraft,
  onSubmit,
}: Props) {
  return (
    <div
      className={[
        styles.overlay,
        isOpen ? styles.overlayOpen : "",
      ].join(" ")}
      aria-hidden={!isOpen}
    >
      <aside
        className={styles.drawer}
        aria-labelledby="appeal-heading"
        aria-modal="true"
        role="dialog"
      >
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Appeal</p>
            <h2 id="appeal-heading">提交申诉</h2>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        <label className={styles.field}>
          <span>补充说明</span>
          <textarea
            rows={6}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="补充原始文件来源、传播链路、拍摄背景或你认为关键的上下文。"
          />
        </label>

        <label className={styles.field}>
          <span>来源链接</span>
          <input
            type="url"
            value={sourceUrl}
            onChange={(event) => onSourceUrlChange(event.target.value)}
            placeholder="https://example.com/source"
          />
        </label>

        <div className={styles.attachments}>
          <strong>当前附件</strong>
          <ul>
            {attachmentNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <p>v1 仅记录附件名称，不会自动上传原图。</p>
        </div>

        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              void onSubmit();
            }}
            disabled={!canSubmitApi || isSubmitting}
          >
            {isSubmitting ? "提交中…" : "提交到服务端"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onDownloadDraft}
          >
            下载 case.json
          </button>
          {fallbackHref ? (
            <a
              className={styles.linkButton}
              href={fallbackHref}
              rel="noreferrer"
              target={fallbackHref.startsWith("mailto:") ? undefined : "_blank"}
            >
              {fallbackLabel}
            </a>
          ) : null}
        </div>

        {message ? <p className={styles.message}>{message}</p> : null}
      </aside>
    </div>
  );
}

