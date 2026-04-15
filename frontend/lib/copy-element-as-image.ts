import { toBlob } from "html-to-image";

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("图片转换失败。"));
    };
    reader.onerror = () => reject(new Error("图片转换失败。"));
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderElementToPngBlob(element: HTMLElement) {
  if (typeof window === "undefined") {
    throw new Error("当前环境不支持导出图片。");
  }

  if ("fonts" in document) {
    await document.fonts.ready;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    throw new Error("卡片还没有渲染完成，暂时无法导出。");
  }

  const blob = await toBlob(element, {
    cacheBust: true,
    pixelRatio: Math.max(2, Math.min(window.devicePixelRatio || 1, 3)),
    backgroundColor: "#ffffff",
    filter: (node) => {
      if (!(node instanceof Element)) {
        return true;
      }
      return node.getAttribute("data-exclude-from-image") !== "true";
    },
  });

  if (!blob) {
    throw new Error("图片导出失败。");
  }

  return blob;
}

type CopyAsImageResult = "clipboard-image" | "clipboard-html" | "download";

export async function copyElementAsImage(element: HTMLElement): Promise<CopyAsImageResult> {
  const pngBlob = await renderElementToPngBlob(element);
  const clipboardAvailable =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    Boolean(navigator.clipboard?.write) &&
    typeof ClipboardItem !== "undefined";

  if (clipboardAvailable) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": Promise.resolve(pngBlob),
        }),
      ]);
      return "clipboard-image";
    } catch {
      try {
        const dataUrl = await blobToDataUrl(pngBlob);
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([`<img src="${dataUrl}" alt="Insight Card" />`], { type: "text/html" }),
            "text/plain": new Blob(["已复制卡片图片。"], { type: "text/plain" }),
          }),
        ]);
        return "clipboard-html";
      } catch {
        downloadBlob(pngBlob, `jeeves-insight-card-${Date.now()}.png`);
        return "download";
      }
    }
  }

  downloadBlob(pngBlob, `jeeves-insight-card-${Date.now()}.png`);
  return "download";
}
