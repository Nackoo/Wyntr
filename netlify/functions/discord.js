export async function handler(event) {
  console.log("Discord function triggered");

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let message, type, extra, screenshot;
  try {
    ({ message, type, extra, screenshot } = JSON.parse(event.body || "{}"));
  } catch (err) {
    console.error("Invalid JSON:", err);
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const url =
    type === "report"
      ? process.env.DISCORD_WEBHOOK_URL_1
      : process.env.DISCORD_WEBHOOK_URL;

  if (!url) {
    console.error("Missing Discord webhook URLs");
    return { statusCode: 500, body: "Missing webhook URL" };
  }

  try {
    const formData = new FormData();
    formData.append(
      "payload_json",
      JSON.stringify({
        content: message || "",
        username: extra?.username || "Wyntr",
        avatar_url: extra?.avatar || undefined,
        embeds: extra?.embeds || [],
      })
    );

    if (screenshot) {
      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      formData.append("file", new Blob([buffer]), "screenshot.png");
    }

    const res = await fetch(url, { method: "POST", body: formData });
    const text = await res.text();

    console.log("Discord response:", res.status, text);

    if (!res.ok) {
      return { statusCode: res.status, body: text };
    }

    return { statusCode: 200, body: "Message sent" };
  } catch (err) {
    console.error("Unexpected error:", err);
    return { statusCode: 500, body: "Error: " + err.message };
  }
}
