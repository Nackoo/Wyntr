const SIZE = 64;
const SKIN_MIN_RATIO = 0.18;
const NSFW_SCORE_THRESHOLD = 0.65;

import { confirmDialog } from "./texts.js";

const loading = document.getElementById("loadingOverlay");

let nsfwModel = null;
let tfReady = false;
let nsfwReady = false;

async function loadNSFW() {
  if (nsfwModel) return nsfwModel;

  if (!tfReady) {
    await import("/lib/script/tf.min.js");

    await tf.setBackend("cpu");      
    await tf.ready();

    tfReady = true;
  }

  if (!nsfwReady) {
    await import("/lib/script/nsfwjs.min.js");
    nsfwReady = true;
  }

  nsfwModel = await window.nsfwjs.load("/lib/nsfw/model.json");
  console.log("NSFW deep model loaded");

  return nsfwModel;
}

async function confirmHeavyScan() {
  const ok = await confirmDialog("Deep scan required", "Our quick scanner detected NSFW media has inserted.\nIf you think this is wrong, we can run a second model that is more accurate but heavier.\nDo you wish to proceed?");
  return ok;
}

function nsfwFromPredictions(preds) {
  let porn = 0;
  let hentai = 0;

  for (const p of preds) {
    if (p.className === "Porn") porn = p.probability;
    if (p.className === "Hentai") hentai = p.probability;
  }

  console.log(preds);

  return porn >= 0.6 || hentai >= 0.6;
}

async function quickImageNSFWCheck(file) {
  // Run fast heuristic first
  const bitmap = await createImageBitmap(file, {
    resizeWidth: SIZE,
    resizeHeight: SIZE
  });

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);

  const quick = analyzeFrame(ctx.getImageData(0, 0, SIZE, SIZE));

  // If fast scan says SAFE → allow immediately
  if (!quick.isNSFW) {
    return {
      ...quick,
      finalNSFW: false,
      stage: "quick"
    };
  }

  // Ask user if we should run heavy model
  const ok = await confirmHeavyScan();
  if (!ok) {
    return {
      ...quick,
      finalNSFW: true,
      stage: "quick-blocked"
    };
  }

  // Run deep ML scan
  const preds = await deepScanImage(file);
  const deepNSFW = nsfwFromPredictions(preds);

  return {
    ...quick,
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

  let votes = 0;
  let skinSum = 0;
  let blobSum = 0;
  let curveSum = 0;
  let scoreSum = 0;

  const frames = [];

  for (const t of times) {
    const frame = await grabVideoFrame(video, t);
    frames.push(frame);

    const r = analyzeFrame(frame);

    skinSum += r.skinRatio ?? 0;
    blobSum += r.blobRatio ?? 0;
    curveSum += r.curveScore ?? 0;
    scoreSum += r.score ?? 0;

    if (r.isNSFW) votes++;
  }

  const n = times.length;
  const quick = {
    skinRatio: skinSum / n,
    blobRatio: blobSum / n,
    curveScore: curveSum / n,
    score: scoreSum / n,
    isNSFW: votes >= 2,
    votes
  };

  // If fast scan says SAFE → allow
  if (!quick.isNSFW) {
    return {
      ...quick,
      finalNSFW: false,
      stage: "quick"
    };
  }

  // Ask user before deep scan
  const ok = await confirmHeavyScan();
  if (!ok) {
    return {
      ...quick,
      finalNSFW: true,
      stage: "quick-blocked"
    };
  }

  // Deep scan frames
  const model = await loadNSFW();
  let deepVotes = 0;

  for (const frame of frames) {
    const canvas = document.createElement("canvas");
    canvas.width = 224;
    canvas.height = 224;
    canvas.getContext("2d").putImageData(frame, 0, 0);

    const preds = await model.classify(canvas);
    if (nsfwFromPredictions(preds)) deepVotes++;
  }

  const deepNSFW = deepVotes >= 2;

  return {
    ...quick,
    finalNSFW: deepNSFW,
    stage: deepNSFW ? "deep-blocked" : "deep-allowed"
  };
}

async function deepScanImage(file) {
  const model = await loadNSFW();

  const bitmap = await createImageBitmap(file);

  const canvas = document.createElement("canvas");
  canvas.width = 224;
  canvas.height = 224;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, 224, 224);

  const preds = await model.classify(canvas);

  return preds;
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

function isSkinPixel(r, g, b) {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  return (
    cb >= 77 && cb <= 127 &&
    cr >= 133 && cr <= 173
  );
}

function analyzeFrame(imageData) {
  const { data, width, height } = imageData;
  const totalPixels = width * height;

  let skin = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (isSkinPixel(data[i], data[i+1], data[i+2])) {
      skin++;
    }
  }

  const skinRatio = skin / totalPixels;

  return {
    skinRatio,
    score: skinRatio,
    isNSFW: skinRatio > 0.08,   
    skinMap: null
  };
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

export { quickVideoNSFWCheck, quickImageNSFWCheck, logNSFWResult }