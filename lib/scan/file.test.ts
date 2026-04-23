import { describe, expect, it } from "vitest";

import { validateImageFile } from "@/lib/scan/file";

describe("validateImageFile", () => {
  it("accepts supported image formats", () => {
    const file = new File(["demo"], "sample.jpg", { type: "image/jpeg" });
    expect(() => validateImageFile(file)).not.toThrow();
  });

  it("rejects unsupported file types", () => {
    const file = new File(["demo"], "sample.gif", { type: "image/gif" });
    expect(() => validateImageFile(file)).toThrow("目前仅支持 JPEG、PNG、WebP 图片。");
  });

  it("rejects oversized files", () => {
    const file = new File([new Uint8Array(13 * 1024 * 1024)], "large.png", {
      type: "image/png",
    });
    expect(() => validateImageFile(file)).toThrow("文件过大");
  });
});
