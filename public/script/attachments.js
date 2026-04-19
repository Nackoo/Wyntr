import { supabase } from "./firebase.js"
import { db, doc, getDoc, auth } from "./firebase.js";
import { log } from "./texts.js";
import { quickImageNSFWCheck, quickVideoNSFWCheck, logNSFWResult } from "./nsfw.js"

function base91ToImageSrc(input, mime = "image/jpeg") {
  if (!input) {
    return "/image/default-avatar.jpg";
  }

  if (typeof input === "string" && input.startsWith("data:image/")) {
    const [header, base64] = input.split(",");
    const m = header.match(/data:(.*?);base64/);
    const type = m ? m[1] : mime;

    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type });
    return URL.createObjectURL(blob);
  }

  if (
    typeof input === "string" &&
    (
      input.startsWith("/image/") ||
      input.startsWith("http://") ||
      input.startsWith("https://") ||
      input.startsWith("blob:")
    )
  ) {
    return input;
  }

  const bytes = base91.decode(input);
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
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

  return await canvasToBlobURL(outCanvas);
}

function canvasToBlobURL(canvas, type = "image/png", quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      resolve(url);
    }, type, quality);
  });
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

let currentFFmpeg = null;

async function getFFmpeg() {
  if (!currentFFmpeg) {
    currentFFmpeg = FFmpeg.createFFmpeg({
      log: true
    });
    await currentFFmpeg.load();
  }
  return currentFFmpeg;
}

async function compressVideoTo480(file) {
  const ffmpeg = await getFFmpeg();

  showCompressionOverlay(true);

  ffmpeg.setProgress(({ ratio }) => {
    updateCompressionProgress(ratio);
  });

  try {
    // write input
    ffmpeg.FS("writeFile", "input.mp4", await FFmpeg.fetchFile(file));

    // run compression
    await ffmpeg.run(
      "-i", "input.mp4",
      "-vf", "scale=-2:480",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "28",
      "-movflags", "+faststart",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-strict", "experimental",
      "output.mp4"
    );

    // read output
    const data = ffmpeg.FS("readFile", "output.mp4");

    updateCompressionProgress(1);

    return new Blob([data.buffer], {
      type: "video/mp4"
    });

  } finally {
    // 🔥 CRITICAL: cleanup virtual FS to prevent memory leaks
    try { ffmpeg.FS("unlink", "input.mp4"); } catch {}
    try { ffmpeg.FS("unlink", "output.mp4"); } catch {}

    showCompressionOverlay(false);
  }
}

function showCompressionOverlay(show) {
  let overlay = document.getElementById("compression-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "compression-overlay";
    overlay.classList.add("overlay");
    overlay.style.cssText = `
      display:flex;
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
    box.style.cssText = `background: var(--dark); padding: 20px; border-radius: 10px; color: var(--color); width: 100%; max-width: 400px; box-shadow: rgba(0, 0, 0, 0.7) 0px 0px 20px; font-family: sans-serif;`;

    const title = document.createElement("h2");
    title.id = "compression-title";
    title.textContent = "Compressing...";
    title.style.cssText = `
      margin-top:0;
      color:#fff;
      font-size:18px;
    `;

    const progressBar = document.createElement("div");
    progressBar.style.cssText = `
      width:100%;
      height:14px;
      background:#333;
      border-radius:10px;
      overflow:hidden;
      margin-top:20px;
    `;

    const progressFill = document.createElement("div");
    progressFill.id = "compression-progress";
    progressFill.style.cssText = `
      height:100%;
      width:0%;
      background:#00a35d;
      transition:width 0.2s linear;
    `;

    progressBar.appendChild(progressFill);

    const cancelBtn = document.createElement("div");
    cancelBtn.innerHTML = `
      <div class="flex">
        <button style="width:100%;padding:10px;margin-left:auto;margin-top:15px;border-radius:12px;background:none;border:1px solid grey;color:var(--color);">
          Cancel
        </button>
      </div>
    `;

    cancelBtn.onclick = () => {
      if (currentFFmpeg) {
        try {
          currentFFmpeg.exit();
        } catch {}
        currentFFmpeg = null;
      }

      const sendBtn = document.getElementById("postBtn");
      if (sendBtn) {
        sendBtn.classList.remove("disabled");
        sendBtn.disabled = false;
      }

      const sendRetweet = document.getElementById("sendRetweet");
      if (sendRetweet) {
        sendRetweet.disabled = false;
        sendRetweet.classList.remove("disabled");
      }

      const send = document.getElementById("sendComment");
      if (send) {
        send.disabled = false;
        send.classList.remove("disabled");
      }

      showCompressionOverlay(false);
    };

    box.appendChild(title);
    box.appendChild(progressBar);
    box.appendChild(cancelBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  if (show) {
    overlay.classList.remove("hidden");
  } else {
    overlay.classList.add("hidden");
  }

  if (show) {
    const bar = document.getElementById("compression-progress");
    const title = document.getElementById("compression-title");

    if (bar) bar.style.width = "0%";
    if (title) title.textContent = "Compressing... 0%";
  }
}

window.showCompressionOverlay = showCompressionOverlay;

function updateCompressionProgress(ratio) {
  const percent = Math.round(ratio * 100);

  const bar = document.getElementById("compression-progress");
  const title = document.getElementById("compression-title");

  if (bar) bar.style.width = percent + "%";
  if (title) title.textContent = `Compressing... ${percent}%`;
}

async function uploadToSupabase(file, uid, isPremium) {
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
      const fileToUpload = isPremium
        ? file
        : await compressVideoTo480(file);

      const filePath = `wints/${uid}-${Date.now()}.mp4`;

      const { data, error } = await supabase.storage
        .from("wints")
        .upload(filePath, fileToUpload, {
          upsert: true
        });

      if (error) {
        console.error("Video upload error:", error);
        log("red", "video upload error");
        return {
          url: "",
          path: "",
          type: ""
        };
      }

      const { data: publicUrlData } =
        supabase.storage
          .from("wints")
          .getPublicUrl(filePath);

      return {
        url: publicUrlData.publicUrl,
        path: filePath,
        type: "video",
      };
    } catch (err) {
      console.error("Video processing error:", err);
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

function canvasToWebP(canvas, quality) {
  return new Promise(res => {
    canvas.toBlob(
      blob => res(blob),
      "image/webp",
      quality
    );
  });
}

async function compressImageTo480(input) {
  const MAX_BASE91 = 1024 * 1024;
  const BASE91_RATIO = 16 / 13; // ≈1.23
  const MAX_BINARY = Math.floor(MAX_BASE91 / BASE91_RATIO);

  const readFile = (file) =>
    new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(file);
    });

  const base64 =
    typeof input === "string" ? input : await readFile(input);

  const img = new Image();
  img.src = base64;
  await img.decode();

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  let scale = 1;
  let quality = 0.85;

  for (let i = 0; i < 50; i++) {
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToWebP(canvas, quality);

    if (blob.size <= MAX_BINARY) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return base91.encode(bytes);
    }

    if (quality > 0.5) {
      quality -= 0.08;
    } else {
      scale *= 0.85;
    }
  }

  throw new Error("Cannot compress under base91 1MB limit");
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

  loading.classList.remove("show");
}

async function makeCollage(inputs) {
  const toImageSrc = (input) =>
    new Promise((resolve, reject) => {
      if (typeof input === "string") {
        return resolve(input);
      }

      if (input instanceof Blob) {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(input);
        return;
      }

      reject(new Error("Invalid image input"));
    });

  const images = [];
  let loaded = 0;

  return new Promise(async (resolve, reject) => {
    for (let i = 0; i < inputs.length; i++) {
      const img = new Image();
      img.crossOrigin = "anonymous";

      try {
        img.src = await toImageSrc(inputs[i]);
      } catch (e) {
        reject(e);
        return;
      }

      img.onload = () => {
        images[i] = img;
        loaded++;
        if (loaded === inputs.length) buildSingleRow(images);
      };

      img.onerror = () =>
        reject(new Error("Image failed to load"));
    }

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

      const totalWidth = Math.round(
        scaled.reduce((sum, s) => sum + s.width, 0)
      );

      const canvas = document.createElement("canvas");
      canvas.width = totalWidth;
      canvas.height = maxHeight;

      const ctx = canvas.getContext("2d");

      let x = 0;
      for (const { img, width, height } of scaled) {
        ctx.drawImage(img, x, 0, width, height);
        x += width;
      }

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