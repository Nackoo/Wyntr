const base91 = require('./base91.js')

const COLOR_MAP = {
  red: 15158332,     // #E74C3C
  green: 3066993,    // #2ECC71
  blue: 3447003,     // #3498DB
  yellow: 16776960,  // #FFFF00
  purple: 10181046,  // #9B59B6
  gray: 8421504      
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { title, color, fields, timestamp, images, type } = JSON.parse(event.body);

    const webhookUrl = type === "user" 
      ? process.env.DISCORD_WEBHOOK_URL_1 
      : process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      return { statusCode: 500, body: "Webhook URL configuration missing on server." };
    }

    const discordColor = COLOR_MAP[color.toLowerCase()] || COLOR_MAP.gray;
    const discordFields = Object.entries(fields || {}).map(([key, value]) => ({
      name: key,
      value: String(value || "None"),
      inline: true
    }));

    const formData = new FormData();
    const embed = {
      title: title,
      color: discordColor,
      fields: discordFields,
      timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString()
    };

    const embedsArray = [embed];
    const videoUrls = []; 

    if (Array.isArray(images) && images.length > 0) {
      images.forEach((imgData, index) => {
        if (!imgData) return;

        const isString = typeof imgData === "string";
        const isUrl = isString && (imgData.startsWith("http://") || imgData.startsWith("https://"));

        const videoExtensions = ['.mp4', '.webm', '.mov', '.m4v', '.avi'];
        const isVideoUrl = isUrl && videoExtensions.some(ext => imgData.toLowerCase().includes(ext));

        if (isVideoUrl) {
          videoUrls.push(imgData);
        } else if (isUrl) {
          if (index === 0) embed.image = { url: imgData };
          else {
            embedsArray.push({ url: embed.url, image: { url: imgData } });
          }
        } else {
          let buffer;
          if (imgData.startsWith("data:image/")) {
            const base64Data = imgData.split(",")[1];
            buffer = Buffer.from(base64Data, 'base64');
          } else {
            buffer = Buffer.from(base91.decode(imgData));
          }

          const filename = `image_${index}.jpg`;
          
          const blob = new Blob([buffer], { type: "image/jpeg" });
          formData.append(`files[${index}]`, blob, filename);

          if (index === 0) {
            embed.image = { url: `attachment://${filename}` };
          } else {
            embedsArray.push({ image: { url: `attachment://${filename}` } });
          }
        }
      });
    }

    const payloadJson = { embeds: embedsArray };

    if (videoUrls.length > 0) {
      payloadJson.content = videoUrls.join("\n");
    }

    formData.append("payload_json", JSON.stringify(payloadJson));

    const response = await fetch(webhookUrl, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: response.status, body: `Discord API error: ${errText}` };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    return { statusCode: 500, body: error.toString() };
  }
};