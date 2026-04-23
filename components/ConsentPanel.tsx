"use client";

import type { ConsentState } from "@/lib/types";

import styles from "./ConsentPanel.module.css";

type Props = {
  value: ConsentState;
  onChange: (value: ConsentState) => void;
};

type ToggleKey = keyof ConsentState;

const toggleCopy: Record<ToggleKey, { title: string; detail: string }> = {
  allowReverseSearch: {
    title: "允许反向搜图",
    detail: "v1 只记录你的选择，不会实际发起外部查询。",
  },
  allowRetention: {
    title: "允许用于改进",
    detail: "默认关闭，不影响使用；v1 不会上传留样。",
  },
  forensicMode: {
    title: "启用取证模式",
    detail: "v1 仅保留本地 case 信息，不生成时间戳。",
  },
};

export function ConsentPanel({ value, onChange }: Props) {
  const toggleValue = (key: ToggleKey) => {
    onChange({
      ...value,
      [key]: !value[key],
    });
  };

  return (
    <section className={styles.panel} aria-labelledby="consent-heading">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Step 02</p>
          <h2 id="consent-heading">显式同意设置</h2>
        </div>
        <p className={styles.meta}>默认全部关闭，v1 仅展示状态，不触发外发请求。</p>
      </div>

      <div className={styles.toggleList}>
        {(Object.keys(toggleCopy) as ToggleKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className={[
              styles.toggleCard,
              value[key] ? styles.toggleCardActive : "",
            ].join(" ")}
            aria-pressed={value[key]}
            onClick={() => toggleValue(key)}
          >
            <span className={styles.toggleIndicator} aria-hidden="true">
              {value[key] ? "ON" : "OFF"}
            </span>
            <span className={styles.toggleBody}>
              <strong>{toggleCopy[key].title}</strong>
              <span>{toggleCopy[key].detail}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

