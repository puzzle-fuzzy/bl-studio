export type PageCaptureResult =
  | {
      ok: true;
      sourceUrl: string;
      title: string;
      content: string;
      capturedAt: string;
      contentHash: string;
    }
  | { ok: false; message: string; reason?: "challenge" };

/**
 * 此函数会被 chrome.scripting 注入当前页面执行。
 * 它只返回正文文本和必要元数据，不返回 DOM、HTML、Cookie 或表单值。
 */
export async function capturePage(): Promise<PageCaptureResult> {
  const maxContentCharacters = 500_000;
  const challengeDetected =
    /挑战|人机验证|安全验证|访问验证|just a moment|challenge/iu.test(
      document.title,
    ) ||
    document.querySelector(
      "iframe[src*='captcha' i], [id*='captcha' i], [class*='captcha' i]",
    ) !== null;
  if (challengeDetected) {
    return {
      ok: false,
      reason: "challenge",
      message: "当前仍是挑战页，请先在浏览器中正常完成验证后再继续。",
    };
  }

  const root =
    document.querySelector("article, main, [role='main']") ?? document.body;
  if (root === null) {
    return { ok: false, message: "当前页面没有可采集的正文。" };
  }

  const clone = root.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      "script, style, noscript, template, svg, canvas, iframe, form, input, textarea, select, button, [hidden], [aria-hidden='true']",
    )
    .forEach((element) => {
      element.remove();
    });

  const content = (clone.innerText || clone.textContent || "")
    .replace(/\u00a0/gu, " ")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  if (!content) {
    return { ok: false, message: "当前页面没有可采集的正文。" };
  }

  if (content.length > maxContentCharacters) {
    return {
      ok: false,
      message: "正文超过 500,000 个字符，请改为选择部分内容后重试。",
    };
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );

  return {
    ok: true,
    sourceUrl: location.href,
    title: document.title.trim().slice(0, 300),
    content,
    capturedAt: new Date().toISOString(),
    contentHash: `sha256:${toLowerHex(digest)}`,
  };

  function toLowerHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }
}
