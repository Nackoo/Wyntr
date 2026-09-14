const SIZE = 64;

const loading = document.getElementById("loadingOverlay");

const NSFW_API_URL = "https://Nackoo-NSFWCLASSIFIER.hf.space";

function nsfwFromPredictions(preds = []) {
  let porn = 0;
  let hentai = 0;

  for (const p of preds || []) {
    if (p.className === "Porn") porn = p.probability;
    if (p.className === "Hentai") hentai = p.probability;
  }

  return porn >= 0.6 || hentai >= 0.6;
}

async function toJpegBlob(file, maxDim = 512) {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  return new Promise(r => canvas.toBlob(r, "image/jpeg", 0.9));
}

async function classifyRemote(blob, filename = "frame.jpg") {
  try {
    const fd = new FormData();
    fd.append("image", blob, filename);

    const res = await fetch(`${NSFW_API_URL}/classify`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(`NSFW API error: ${res.status}`);

    const data = await res.json();
    return Array.isArray(data.predictions) ? data.predictions : [];
  } catch (error) {
    console.warn("NSFW image classification failed; allowing image.", error);
    return [];
  }
}

async function classifyBatchRemote(blobs) {
  try {
    const fd = new FormData();
    blobs.forEach((b, i) => fd.append("images", b, `frame${i}.jpg`));

    const res = await fetch(`${NSFW_API_URL}/classify-batch`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(`NSFW API error: ${res.status}`);

    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch (error) {
    console.warn("NSFW video classification failed; allowing video.", error);
    return [];
  }
}

async function quickImageNSFWCheck(file) {
  loading.classList.add("show");

  let preds = [];
  let deepNSFW = false;
  try {
    const jpegBlob = await toJpegBlob(file);
    preds = await classifyRemote(jpegBlob, "image.jpg");
    deepNSFW = nsfwFromPredictions(preds);
  } catch (error) {
    console.warn("NSFW image check failed; allowing upload.", error);
    deepNSFW = false;
    preds = [];
  } finally {
    loading.classList.remove("show");
  }

  return {
    skinRatio: 0,
    score: 0,
    isNSFW: deepNSFW,
    finalNSFW: deepNSFW,
    stage: deepNSFW ? "deep-blocked" : "deep-allowed",
    predictions: preds
  };
}

async function quickVideoNSFWCheck(videoFile) {
  const video = document.createElement("video");
  video.src = URL.createObjectURL(videoFile);
  video.muted = true;

  await new Promise(r => video.onloadedmetadata = r);

  const duration = video.duration || 1;
  const times = [0.5, duration * 0.5, Math.max(duration - 0.5, 0)];

  loading.classList.add("show");

  let deepNSFW = false;
  try {
    const blobs = [];
    for (const t of times) blobs.push(await grabVideoFrameBlob(video, t));

    const results = await classifyBatchRemote(blobs);
    const deepVotes = (results || []).filter(nsfwFromPredictions).length;
    deepNSFW = deepVotes >= 2;
  } catch (error) {
    console.warn("NSFW video check failed; allowing upload.", error);
    deepNSFW = false;
  } finally {
    loading.classList.remove("show");
    URL.revokeObjectURL(video.src);
  }

  return {
    skinRatio: 0,
    score: 0,
    isNSFW: deepNSFW,
    finalNSFW: deepNSFW,
    stage: deepNSFW ? "deep-blocked" : "deep-allowed",
    votes: 0
  };
}

async function grabVideoFrame(video, time) {
  video.currentTime = time;
  await new Promise(r => video.onseeked = r);

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, SIZE, SIZE);

  return ctx.getImageData(0, 0, SIZE, SIZE);
}

async function grabVideoFrameBlob(video, time, size = 224) {
  video.currentTime = time;
  await new Promise(r => video.onseeked = r);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  canvas.getContext("2d").drawImage(video, 0, 0, size, size);
  return new Promise(r => canvas.toBlob(r, "image/jpeg", 0.9));
}

function isSkinPixel(r, g, b) {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}

function analyzeFrame(imageData) {
  const { data, width, height } = imageData;
  const totalPixels = width * height;

  let skin = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (isSkinPixel(data[i], data[i + 1], data[i + 2])) skin++;
  }

  const skinRatio = skin / totalPixels;

  return { skinRatio, score: skinRatio, isNSFW: skinRatio > 0.08, skinMap: null };
}

function logNSFWResult(type, result) {
  console.group(`NSFW → ${type.toUpperCase()}`);
  console.log("Skin:", (result.skinRatio * 100).toFixed(1) + "%");
  console.log("Score:", result.score.toFixed(2));
  console.log("Quick NSFW:", result.isNSFW);
  console.log("Final NSFW:", result.finalNSFW);
  console.log("Stage:", result.stage);
  console.groupEnd();
}

export { quickVideoNSFWCheck, quickImageNSFWCheck, logNSFWResult };