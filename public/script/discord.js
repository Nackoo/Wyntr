import { log } from "./texts.js";

export async function sendToDiscord(message, extra = {}, screenshot = null) {
  try {
    await fetch("/.netlify/functions/discord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, extra, screenshot }),
    });
  } catch (err) {
    log("red", "Failed to send to Discord:");
  }
}

export async function reportToDiscord(message, extra = {}, screenshot = null) {
  try {
    const payload = {
      message,
      type: "report",
      extra,
      screenshot,
    };

    const res = await fetch("/.netlify/functions/discord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Discord report failed:", text);
      log("red", "Failed to send report");
    } else {
      log("green", "Report sent successfully");
    }
  } catch (err) {
    log("red", "Error sending report");
  }
}
