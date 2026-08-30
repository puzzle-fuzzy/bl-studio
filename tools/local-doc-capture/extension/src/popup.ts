type ExtensionResponse =
  | { ok: true; captureId?: string; message: string }
  | { ok: false; message: string };

const captureButton = document.querySelector<HTMLButtonElement>("#capture");
const startBatchButton =
  document.querySelector<HTMLButtonElement>("#start-batch");
const stopBatchButton =
  document.querySelector<HTMLButtonElement>("#stop-batch");
const resumeBatchButton =
  document.querySelector<HTMLButtonElement>("#resume-batch");
const maxPagesInput = document.querySelector<HTMLInputElement>("#max-pages");
const statusElement = document.querySelector<HTMLDivElement>("#status");

if (
  captureButton !== null &&
  startBatchButton !== null &&
  stopBatchButton !== null &&
  resumeBatchButton !== null &&
  maxPagesInput !== null &&
  statusElement !== null
) {
  const popupStatusElement = statusElement;
  const popupStopBatchButton = stopBatchButton;
  const popupResumeBatchButton = resumeBatchButton;

  captureButton.addEventListener("click", async () => {
    await runAction(captureButton, "正在读取当前页面并提交……", {
      type: "capture-active-tab",
    });
  });

  startBatchButton.addEventListener("click", async () => {
    const maxPages = Number(maxPagesInput.value);
    await runAction(startBatchButton, "正在启动批量采集……", {
      type: "start-batch-capture",
      maxPages,
    });
    await refreshBatchStatus();
  });

  stopBatchButton.addEventListener("click", async () => {
    await runAction(stopBatchButton, "正在停止批量采集……", {
      type: "stop-batch-capture",
    });
    await refreshBatchStatus();
  });

  resumeBatchButton.addEventListener("click", async () => {
    await runAction(resumeBatchButton, "正在继续批量采集……", {
      type: "resume-batch-capture",
    });
    await refreshBatchStatus();
  });

  void refreshBatchStatus();
  window.setInterval(() => void refreshBatchStatus(), 1_000);

  async function runAction(
    button: HTMLButtonElement,
    pendingMessage: string,
    message: unknown,
  ): Promise<void> {
    button.disabled = true;
    popupStatusElement.textContent = pendingMessage;
    try {
      const result =
        await chrome.runtime.sendMessage<ExtensionResponse>(message);
      popupStatusElement.textContent = result.message;
    } catch (error) {
      popupStatusElement.textContent =
        error instanceof Error ? error.message : "本地采集失败，请稍后重试。";
    } finally {
      button.disabled = false;
    }
  }

  async function refreshBatchStatus(): Promise<void> {
    try {
      const result = await chrome.runtime.sendMessage<ExtensionResponse>({
        type: "get-batch-status",
      });
      if (result.ok) popupStatusElement.textContent = result.message;
      const isRunning = result.ok && result.message.startsWith("批量采集中");
      const isPaused = result.ok && result.message.startsWith("批量采集已暂停");
      popupStopBatchButton.disabled = !isRunning;
      popupResumeBatchButton.disabled = !isPaused;
    } catch {
      popupStopBatchButton.disabled = true;
      popupResumeBatchButton.disabled = true;
    }
  }
}
