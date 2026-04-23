"use client";

import { useRef, useState } from "react";

import { formatFileSize } from "@/lib/scan/file";

import styles from "./UploadPanel.module.css";

type Props = {
  selectedFileName: string | null;
  selectedFileSize: number | null;
  previewUrl: string | null;
  uploadError: string;
  onFileSelected: (file: File) => void;
  onClearSelection: () => void;
};

export function UploadPanel({
  selectedFileName,
  selectedFileSize,
  previewUrl,
  uploadError,
  onFileSelected,
  onClearSelection,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <section className={styles.panel} aria-labelledby="upload-heading">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Step 01</p>
          <h2 id="upload-heading">上传图片</h2>
        </div>
        <p className={styles.meta}>
          支持点击选择、拖拽上传或粘贴图片。
        </p>
      </div>

      <div
        className={[
          styles.dropzone,
          isDragging ? styles.dropzoneActive : "",
        ].join(" ")}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) {
            onFileSelected(file);
          }
        }}
      >
        <div className={styles.dropzoneBody}>
          <p className={styles.dropzoneTitle}>本地图片优先</p>
          <p className={styles.dropzoneText}>
            直接拖入图片，或使用文件选择器读取本地文件。
          </p>
          <div className={styles.dropzoneActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => fileInputRef.current?.click()}
            >
              选择图片
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClearSelection}
              disabled={!selectedFileName}
            >
              清空
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={styles.hiddenInput}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onFileSelected(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </div>

        <div className={styles.previewCard}>
          {previewUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="当前选中的图片预览"
                className={styles.previewImage}
                src={previewUrl}
              />
              <div className={styles.previewMeta}>
                <strong>{selectedFileName}</strong>
                <span>
                  {selectedFileSize ? formatFileSize(selectedFileSize) : ""}
                </span>
              </div>
            </>
          ) : (
            <div className={styles.previewEmpty}>
              <span>NO PREVIEW</span>
              <p>尚未选择图片</p>
            </div>
          )}
        </div>
      </div>

      {uploadError ? (
        <p className={styles.errorText} role="alert">
          {uploadError}
        </p>
      ) : null}
    </section>
  );
}
