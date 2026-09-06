export type TranscriptGenerationProgress = {
  percentage: number;
  stage: string;
};

type TranscriptStreamEvent<T> =
  | ({ type: "progress" } & TranscriptGenerationProgress)
  | { type: "complete"; data: T }
  | { type: "error"; message: string };

export async function streamTranscriptGeneration<T>(
  url: string,
  onProgress: (progress: TranscriptGenerationProgress) => void,
): Promise<T> {
  let displayedPercentage = 0;
  let displayedStage = "Preparing";
  const estimatedProgressTimer = window.setInterval(() => {
    // The server sends real milestones when the connection is streaming.
    // Keep the button moving locally as well because a browser/proxy may
    // buffer those small progress events until the request completes.
    displayedPercentage = Math.min(90, displayedPercentage + 1);
    onProgress({ percentage: displayedPercentage, stage: displayedStage });
  }, 1500);

  const updateProgress = (progress: TranscriptGenerationProgress) => {
    displayedPercentage = Math.max(displayedPercentage, progress.percentage);
    displayedStage = progress.stage;
    onProgress({ percentage: displayedPercentage, stage: displayedStage });
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/x-ndjson" },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || response.statusText);
    }
    if (!response.body) throw new Error("The browser could not read transcript progress.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completedData: T | undefined;

    const processLine = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as TranscriptStreamEvent<T>;
      if (event.type === "progress") {
        updateProgress({ percentage: event.percentage, stage: event.stage });
      } else if (event.type === "complete") {
        completedData = event.data;
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.forEach(processLine);
      if (done) break;
    }
    processLine(buffer);

    if (completedData === undefined) {
      throw new Error("Transcript generation ended before the transcript was saved.");
    }
    updateProgress({ percentage: 100, stage: "Transcript ready" });
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    return completedData;
  } finally {
    window.clearInterval(estimatedProgressTimer);
  }
}