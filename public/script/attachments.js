import { supabase } from "./firebase.js"
import { db, doc, getDoc, auth } from "./firebase.js";
import { log } from "./texts.js";
import { quickImageNSFWCheck, quickVideoNSFWCheck, logNSFWResult } from "./nsfw.js"

function base91ToImageSrc(encoded, mime = "image/jpeg") {
  if (typeof encoded === "string" && encoded.startsWith("data:image/")) {
    return encoded;
  }
  if (typeof encoded === "string" && encoded.startsWith("/image/")) {
    return encoded;
  }
  if (encoded == null || encoded === "") {
    return `/image/default-avatar.jpg`;
  }

  const bytes = base91.decode(encoded);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  const base64 = btoa(binary);
  return `data:${mime};base64,${base64}`;
}

async function dataUrlToBase91(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:")) return dataUrl;

  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  return base91.encode(bytes);
}

async function upscale(url, scale = 2) {
  const img = new Image();
  img.crossOrigin = "anonymous";

  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = url;
  });

  const sw = img.width;
  const sh = img.height;
  const dw = sw * scale;
  const dh = sh * scale;

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = sw;
  srcCanvas.height = sh;
  const sctx = srcCanvas.getContext("2d");
  sctx.drawImage(img, 0, 0);

  const src = sctx.getImageData(0, 0, sw, sh);
  const dst = new ImageData(dw, dh);

  const s = src.data;
  const d = dst.data;

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const gx = x / scale;
      const gy = y / scale;

      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);

      const dx = gx - x0;
      const dy = gy - y0;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      const di = (y * dw + x) * 4;

      for (let c = 0; c < 4; c++) {
        d[di + c] =
          s[i00 + c] * (1 - dx) * (1 - dy) +
          s[i10 + c] * dx * (1 - dy) +
          s[i01 + c] * (1 - dx) * dy +
          s[i11 + c] * dx * dy;
      }
    }
  }

  const outCanvas = document.createElement("canvas");
  outCanvas.width = dw;
  outCanvas.height = dh;
  outCanvas.getContext("2d").putImageData(dst, 0, 0);

  return outCanvas.toDataURL("image/png");
}

const upscaleCache = new Map();

async function upscaleCached(url, scale = 2) {
  const key = url + "@" + scale;
  if (upscaleCache.has(key)) return upscaleCache.get(key);

  const result = await upscale(url, scale);
  upscaleCache.set(key, result);
  return result;
}

async function handleUpscale(img) { 
  if (img.dataset.upscaled) return; 
  img.dataset.upscaled = "1"; 

  const src = img.dataset.src || img.src; 
  if (!src) return; 

  img.src = src; 
  try { 
    img.onload = async () => { 
      if (img.naturalWidth >= 720) return; 
      const upscaled = await upscaleCached(src, 2); 
      img.src = upscaled; 
    }; 
  } catch (e) { 
    console.warn("Upscale failed:", src); 
  } 
}

const observerx = new MutationObserver(mutations => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;

      if (node.tagName === "IMG" && node.classList.contains("upscale")) {
        handleUpscale(node);
      }

      node
        .querySelectorAll?.("img.upscale")
        .forEach(handleUpscale);
    }
  }
});

observerx.observe(document.body, {
  childList: true,
  subtree: true
});

const loading = document.getElementById("loadingOverlay");

let ffmpeg;

async function compressVideoTo480(file) {
  currentFFmpeg = FFmpeg.createFFmpeg({
    log: true
  });
  await currentFFmpeg.load();

  showCompressionOverlay(true);

  currentFFmpeg.setLogger(({
    type,
    message
  }) => {
    appendCompressionLog(`[${type}] ${message}`);
  });

  currentFFmpeg.FS("writeFile", "input.mp4", await FFmpeg.fetchFile(file));

  await currentFFmpeg.run(
    "-i", "input.mp4",
    "-vf", "scale=-2:480",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "28",
    "-c:a", "aac",
    "output.mp4"
  );

  const data = currentFFmpeg.FS("readFile", "output.mp4");

  showCompressionOverlay(false);

  return new Blob([data.buffer], {
    type: "video/mp4"
  });
}

let currentFFmpeg = null;

function showCompressionOverlay(show) {
  let overlay = document.getElementById("compression-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "compression-overlay";
    overlay.style.cssText = `
      display:none;
      position:fixed;
      top:0; left:0;
      width:100%; height:100%;
      background:rgba(0,0,0,0.6);
      z-index:9999;
      display:flex;
      justify-content:center;
      align-items:center;
    `;

    const box = document.createElement("div");
    box.className = "overlay-box";
    box.style.cssText = `
      background: var(--dark);
      padding:20px;
      border-radius:10px;
      color: var(--color);
      font-family:monospace;
      width:80%;
      max-width:600px;
      max-height:70%;
      overflow:auto;
      box-shadow:0 0 20px rgba(0,0,0,0.7);
    `;

    const title = document.createElement("h2");
    title.textContent = "Compressing...";
    title.style.cssText = "margin-top:0; color:#fff; font-family:sans-serif; font-size:18px;";

    const logBox = document.createElement("pre");
    logBox.id = "compression-log";
    logBox.style.cssText = `
      margin-top:20px;
      font-size:12px;
      white-space:pre-wrap;
      max-height:300px;
      overflow:auto;
      border-radius: 7px;
      background: var(--light);
    `;

    const cancelBtn = document.createElement("div");
    cancelBtn.innerHTML = `<div class="flex"><button style="width:100%;padding:10px;margin-left:auto;margin-top:10px;border-radius:12px;">Cancel</button></div>`;
    cancelBtn.onclick = () => {
      if (currentFFmpeg) {
        try {
          currentFFmpeg.exit();
        } catch {}
      }
      overlay.style.display = "none";
      const sendBtn = document.getElementById("postBtn");
      sendBtn.classList.remove("disabled");
      sendBtn.disabled = false;
      const sendRetweet = document.getElementById("sendRetweet");
      sendRetweet.disabled = false;
      sendRetweet.classList.remove('disabled')
      const send = document.getElementById("sendComment");
      send.disabled = false;
      send.classList.remove("disabled");;
    };

    box.appendChild(title);
    box.appendChild(logBox);
    box.appendChild(cancelBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  overlay.style.display = show ? "flex" : "none";
  if (show) document.getElementById("compression-log").textContent = "";
}

function appendCompressionLog(msg) {
  const logBox = document.getElementById("compression-log");
  if (logBox) {
    logBox.textContent += msg + "\n";
    logBox.scrollTop = logBox.scrollHeight;
  }
}

async function uploadToSupabase(file, uid) {
  if (!file) return {
    url: "",
    path: "",
    type: ""
  };

  if (file.type.startsWith("image/")) {
    const compressedBase64 = await compressImageTo480(file);

    const base64Size = Math.ceil((compressedBase64.length * 3) / 4);
    if (base64Size > 3 * 1024 * 1024) {
      log("red", "Image is too large after compression");
      return {
        url: "",
        path: "",
        type: ""
      };
    }

    return {
      url: compressedBase64,
      path: null,
      type: "image"
    };
  }

  if (file.type.startsWith("video/")) {
    try {
      const compressedFile = await compressVideoTo480(file);

      const filePath = `wints/${uid}-${Date.now()}.mp4`;
      const {
        data,
        error
      } = await supabase.storage
        .from("wints")
        .upload(filePath, compressedFile, {
          upsert: true
        });

      if (error) {
        console.error("Video upload error:", error);
        return {
          url: "",
          path: "",
          type: ""
        };
      }

      const {
        data: publicUrlData
      } = supabase.storage
        .from("wints")
        .getPublicUrl(filePath);

      return {
        url: publicUrlData.publicUrl,
        path: filePath,
        type: "video",
      };
    } catch (err) {
      console.error("Video compression failed:", err);
      return {
        url: "",
        path: "",
        type: ""
      };
    }
  }

  log("red", "Unsupported file type");
  return {
    url: "",
    path: "",
    type: ""
  };
}

async function compressImageTo480(file) {
  const MAX_BYTES = 1024 * 1024;

  const getSize = (b64) =>
    Math.ceil((b64.length * 3) / 4);

  const readFile = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

  const originalBase64 = await readFile(file);

  if (getSize(originalBase64) <= MAX_BYTES) {
    return originalBase64;
  }

  const img = new Image();
  img.src = originalBase64;

  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  let width = img.width;
  let height = img.height;

  let quality = 0.82;
  let scale = 1;

  let output;

  for (let i = 0; i < 12; i++) {
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    output = canvas.toDataURL("image/jpeg", quality);

    if (getSize(output) <= MAX_BYTES) {
      return output;
    }

    /**
     * 1. Reduce quality first (least visible)
     * 2. Then reduce resolution slightly
     * 3. Never jump aggressively
     */

    if (quality > 0.6) {
      quality -= 0.06;
    } else {
      scale *= 0.92;
    }
  }

  return output;
}

let lastURL = null;

async function showImagePreview(input, previewElementId) {
  if (lastURL) {
    URL.revokeObjectURL(lastURL);
    lastURL = null;
  }

  const file = input.files[0];
  const preview = document.getElementById(previewElementId);
  preview.innerHTML = "";

  if (!file) return;

  if (file.type.startsWith("video/")) {
    const videoURL = URL.createObjectURL(file);
    preview.innerHTML = `
      <video controls class="attachment">
        <source src="${videoURL}">
      </video>`;
    return;
  }

  if (file.type.startsWith("image/")) {
    const imageURL = URL.createObjectURL(file);

    preview.innerHTML = `<img src="${imageURL}" class="attachment">`;
  }

  const imageURL = URL.createObjectURL(compressedBlob);
  lastURL = imageURL;
  preview.innerHTML = `<img src="${imageURL}" class="attachment">`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function checkOverlayState() {
  const overlays = document.querySelectorAll(
    ".overlay:not(#loadingOverlay):not(#info):not(#confirm):not(#inputDialog):not(#log), .useroverlay, .mediaOverlay"
  );
  
  const loadingOverlay = document.querySelector("#loadingOverlay");
  const anyVisible = Array.from(overlays).some(el => !el.classList.contains("hidden"));
  const loadingVisible = loadingOverlay?.classList.contains("show");
  const disableScroll = anyVisible || loadingVisible;

  document.body.classList.toggle("no-scroll", disableScroll);
}

const observer = new MutationObserver(checkOverlayState);

document.querySelectorAll(".overlay, .useroverlay, .mediaOverlay").forEach(el => {
  observer.observe(el, {
    attributes: true,
    attributeFilter: ['class']
  });
});

const overlay = document.querySelector(".mediaOverlay");
const overlayContent = document.getElementById("overlayContent");

overlay.addEventListener("click", (e) => {
  if (e.target === overlay) {
    overlay.classList.add("hidden");
    overlayContent.innerHTML = "";
  }
});

document.addEventListener("click", (e) => {
  if (e.target.id === "closeOverlay") {
    overlay.classList.add("hidden");
    overlayContent.innerHTML = "";
  }
});

document.body.addEventListener("click", (e) => {
  if (e.target.tagName === "VIDEO" || e.target.closest("video")) return;

  if (e.target.tagName === "IMG" && e.target.closest(".attachment, #tweetPreview, #commentPreview, #replyPreview")) {
    const img = e.target;
    overlay.classList.remove("hidden");
    overlayContent.innerHTML = `<img src="${img.src}" />`;
    return;
  }

  const container = e.target.closest(".attachment, .attachment1, .attachment2");
  if (container && container.tagName === "VIDEO") {
    overlay.classList.remove("hidden");
    overlayContent.innerHTML = `<video controls src="${container.src}"></video>`;
  }
});

async function getSupabaseVideo(fileUrl, videoId) {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error("Failed to fetch video");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const videoEl = document.getElementById(videoId);
    if (videoEl) {
      videoEl.innerHTML = "";

      const source = document.createElement("source");
      source.src = objectUrl;
      source.type = blob.type || "video/mp4";
      videoEl.appendChild(source);

      videoEl.load();
    }
  } catch (err) {
    console.error("Failed to load Supabase video:", err);

    const videoEl = document.getElementById(videoId);
    if (videoEl) {
      videoEl.innerHTML = `<source src="${fileUrl}" type="video/mp4">`;
      videoEl.load();
    }
  }
}
window.getSupabaseVideo = getSupabaseVideo;

async function downloadFile(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();

    let ext = "";
    if (blob.type.includes("png")) ext = ".png";
    else if (blob.type.includes("jpeg")) ext = ".jpg";
    else if (blob.type.includes("gif")) ext = ".gif";
    else if (blob.type.includes("mp4")) ext = ".mp4";
    else if (blob.type.includes("webm")) ext = ".webm";

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename.endsWith(ext) ? filename : filename + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    console.error("Download failed:", err);
  }
}

document.getElementById("commentMediaInput").addEventListener("change", (e) => {
  handleMediaInput(e, document.getElementById("commentPreview"));
});

function setupPasteImageHandler(textareaId, mediaInputId, previewId) {
  const textarea = document.getElementById(textareaId);
  const mediaInput = document.getElementById(mediaInputId);
  const previewEl = document.getElementById(previewId);

  textarea.addEventListener("paste", async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedImages = [];

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) pastedImages.push(file);
      }
    }

    if (!pastedImages.length) return;

    e.preventDefault();

    const dt = new DataTransfer();

    Array.from(mediaInput.files || []).forEach(f => dt.items.add(f));
    pastedImages.forEach(f => dt.items.add(f));

    mediaInput.files = dt.files;

    await handleMediaInput(
      { target: mediaInput },
      previewEl
    );
  });
}

setupPasteImageHandler(
  "tweetInput",
  "mediaInput",
  "tweetPreview"
);

setupPasteImageHandler(
  "replyInput",
  "replyMediaInput",
  "replyPreview"
);

setupPasteImageHandler(
  "commentInput",
  "commentMediaInput",
  "commentPreview"
);

setupPasteImageHandler(
  "retweetText",
  "retweetMedia-TWEETID",
  "retweetPreview-TWEETID"
);

setupDragAndDrop({
  box: "#tweetOverlay .comment-box",
  overlay: "#tweetOverlay",
  input: "#mediaInput",
  preview: "tweetPreview"
});

setupDragAndDrop({
  box: "#replyOverlay .comment-box",
  overlay: "#replyOverlay",
  input: "#replyMediaInput",
  preview: "replyPreview"
});

setupDragAndDrop({
  box: "#commentOverlay .comment-box",
  overlay: "#commentOverlay",
  input: "#commentMediaInput",
  preview: "commentPreview"
});

setupDragAndDrop({
  box: "#retweetOverlay .comment-box",
  overlay: "#retweetOverlay",
  input: "#retweetMedia-TWEETID",
  preview: "retweetPreview-TWEETID"
});


function setupDragAndDrop({ box, overlay, input, preview }) {
  const dropBox = document.querySelector(box);
  const parentOverlay = document.querySelector(overlay);
  const mediaInput = document.querySelector(input);
  const previewEl = document.getElementById(preview);
  const dropOverlay = document.getElementById("dropOverlay");

  if (!dropBox || !parentOverlay || !mediaInput) return;

  let dragActive = false;

  const isOverlayVisible = () =>
    !parentOverlay.classList.contains("hidden");

  dropBox.addEventListener("dragenter", e => {
    if (!isOverlayVisible()) return;
    if (!e.dataTransfer?.types?.includes("Files")) return;

    dragActive = true;
    dropOverlay.classList.remove("hidden");
  });

  dropBox.addEventListener("dragover", e => {
    if (!dragActive || !isOverlayVisible()) return;
    e.preventDefault();
  });

  dropBox.addEventListener("dragleave", e => {
    if (!dropBox.contains(e.relatedTarget)) {
      dragActive = false;
      dropOverlay.classList.add("hidden");
    }
  });

  dropBox.addEventListener("drop", async e => {
    if (!dragActive || !isOverlayVisible()) return;
    if (!e.dataTransfer?.files?.length) return;

    e.preventDefault();
    dragActive = false;
    dropOverlay.classList.add("hidden");

    const dt = new DataTransfer();

    Array.from(mediaInput.files || []).forEach(f =>
      dt.items.add(f)
    );

    Array.from(e.dataTransfer.files).forEach(f =>
      dt.items.add(f)
    );

    mediaInput.files = dt.files;

    await handleMediaInput(
      { target: mediaInput },
      previewEl
    );
  });
}

const sharedCanvas = document.createElement("canvas");
const sharedCtx = sharedCanvas.getContext("2d", { willReadFrequently: true });

async function handleMediaInput(e, previewEl) {
  loading.classList.add("show");

  const files = Array.from(e.target.files);

  if (!files.length) {
    previewEl.innerHTML = "";
    loading.classList.remove("show");
    return;
  }

  previewEl.innerHTML = ""; 
  previewEl.style.position = "relative";
  previewEl.style.marginBottom = "20px";

  if (!files.length) {
    loading.classList.remove("show");
    return;
  }

  const videos = files.filter(f => f.type.startsWith("video/"));
  const images = files.filter(f => f.type.startsWith("image/"));

  if (videos.length > 1) {
    log("red", "Videos can't be inserted more than one");
    e.target.value = "";
    loading.classList.remove("show");
    return;
  }

  if (images.length > 4) {
    log("red", "Maximum image count is 4");
    e.target.value = "";
    loading.classList.remove("show");
    return;
  }

  if (videos.length && images.length) {
    log("red", "You can't upload videos and images together");
    e.target.value = "";
    loading.classList.remove("show");
    return;
  }

  let maxSize = 3.5 * 1024 * 1024;

  try {
    const userRef = doc(db, "users", auth.currentUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      const premiumExpiry = data.premium ? data.premium.toDate() : null;
      const isPremium = premiumExpiry && premiumExpiry > new Date();
      maxSize = isPremium ? 5.11 * 1024 * 1024 : maxSize;
    }
  } catch (err) {
    console.warn("Could not check premium status:", err);
  }

  for (const file of files) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);

    const sizeBadge = document.createElement("div");
    sizeBadge.textContent = `${sizeInMB} MB`;
    sizeBadge.style.cssText = `
      position:absolute;
      top:10px;
      left:10px;
      padding:2px 6px;
      font-size:12px;
      border-radius:4px;
      color:#fff;
      background:${file.size > maxSize ? "#db1d23" : "rgba(0,0,0,0.6)"};
      z-index:10;
    `;

    previewEl.appendChild(sizeBadge);

    if (file.size <= maxSize) {
      const sendBtn = document.getElementById("sendComment");
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.classList.remove("disabled");
      }
    }
  }

  if (videos.length === 1) {
    const result = await quickVideoNSFWCheck(videos[0]);
    logNSFWResult("video", result);
    if (result.finalNSFW) {
      log("red", "video contains NSFW");
      loading.classList.remove("show");
      e.target.value = "";
      return;
    }
    const video = document.createElement("video");
    video.src = URL.createObjectURL(videos[0]);
    video.controls = true;
    video.style.maxWidth = "100%";
    video.style.maxHeight = "333px";
    previewEl.appendChild(video);
  }

  for (const file of images) {
    const result = await quickImageNSFWCheck(file);
    logNSFWResult("image", result);
    if (result.finalNSFW) {
      log("red", "image contains NSFW");
      e.target.value = "";
      loading.classList.remove("show");
      return;
    }
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.style.maxWidth = "100%";
    img.style.maxHeight = "200px";
    img.style.margin = "5px";
    previewEl.appendChild(img);
  }

  if (images.length > 1) {
    try {
      const compressed = await Promise.all(
        images.map(f => compressImageTo480(f))
      );
      await makeCollage(compressed);
    } catch (err) {
      console.warn("Collage generation failed:", err);
    }
  }

  loading.classList.remove("show");
}

async function makeCollage(base64Images) {
  return new Promise((resolve, reject) => {
    const images = [];
    let loaded = 0;

    base64Images.forEach((src, i) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        images[i] = img;
        loaded++;
        if (loaded === base64Images.length) buildSingleRow(images);
      };
      img.onerror = reject;
      img.src = src;
    });

    function buildSingleRow(images) {
      const maxHeight = Math.max(...images.map(img => img.height));

      const scaled = images.map(img => {
        const scale = maxHeight / img.height;
        return {
          img,
          width: img.width * scale,
          height: maxHeight
        };
      });

      const totalWidth = scaled.reduce((sum, s) => sum + s.width, 0);

      const canvas = document.createElement("canvas");
      canvas.width = totalWidth;
      canvas.height = maxHeight;
      const ctx = canvas.getContext("2d");

      let x = 0;
      scaled.forEach(({ img, width, height }) => {
        ctx.drawImage(img, x, 0, width, height);
        x += width;
      });

      resolve(canvas.toDataURL("image/jpeg", 0.9));
    }
  });
}

document.getElementById("mediaInput").addEventListener("change", (e) => {
  handleMediaInput(e, document.getElementById("tweetPreview"));
});

document.getElementById("replyMediaInput").addEventListener("change", (e) => {
  handleMediaInput(e, document.getElementById("replyPreview"));
});

document.getElementById("retweetMedia-TWEETID").addEventListener("change", (e) => {
  handleMediaInput(e, document.getElementById("retweetPreview-TWEETID"));
});

export {dataUrlToBase91, base91ToImageSrc, uploadToSupabase, compressImageTo480, showImagePreview, readFileAsBase64, getSupabaseVideo, downloadFile, makeCollage, quickImageNSFWCheck, logNSFWResult }