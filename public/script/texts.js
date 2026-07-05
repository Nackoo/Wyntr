import { base91ToImageSrc } from "./attachments.js";
import { getDoc, doc, db, auth, getDocs } from "./firebase.js";
import { getUserData } from "./index.js";
import { renderCard } from "./cardRenderer.js";

const loading = document.getElementById("loadingOverlay");

let timer = null;
const observer = new MutationObserver(() => {
  if (loading.classList.contains("show")) {
    if (!timer) {
      timer = setTimeout(() => {
        log("grey", "we removed the loading for you, thought you were stuck there")
        loading.classList.remove("show");
        timer = null;
      }, 20000);
    }
  } else {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
});

observer.observe(loading, { attributes: true, attributeFilter: ["class"] });

function log(color, text) {
  const log = document.getElementById("log");
  let col = "grey";
  if (color === "red") {
    col = "#d22d39"
  } else if (color === "green") {
    col = "#04aa63"
  } else {
    col = color
  }
  log.querySelector("p").textContent = text;
  log.querySelector("p").style.color = col;
  log.querySelector(".popup-box .popup-box").style.border = `2px solid ${col}`;
  log.classList.add("show");

  setTimeout(() => { 
    log.classList.remove("show");
  }, 4000);
}

function createEmojiOverlay(button) {
  const emojis = [
    "📁","⭐","🔥","😂","💡","📌","🎵","🧠",
    "📚","💻","🎮","❤️","⚡","📝","🔖"
  ];

  const overlay = document.createElement("div");
  overlay.classList.add("overlay");
  overlay.style.zIndex = "1001";

  const picker = document.createElement("div");
  picker.id = "emojipicker";

  const title = document.createElement("div");
  title.textContent = "Choose icon";
  title.style.cssText = `font-size: 16px; opacity: 0.6; grid-column: 1 / -1;`;

  picker.prepend(title);

  emojis.forEach(e => {
    const btn = document.createElement("button");
    btn.textContent = e;

    btn.onclick = () => {
      button.textContent = e;
      overlay.remove();
    };

    picker.appendChild(btn);
  });

  overlay.onclick = e => {
    if (e.target === overlay) overlay.remove();
  };

  overlay.appendChild(picker);
  document.body.appendChild(overlay);
}

function inputDialog(title, desc, extraElement, inputValue, red) {
  return new Promise(resolve => {
    if (loading.classList.contains("show")) {
      loading.classList.remove("show");
    }
    setTimeout(() => {
      document.body.classList.add("no-scroll");
    }, 1);

    const modal = document.getElementById("inputDialog");
    const input = document.getElementById("inputDialogValue");

    document.getElementById("extra").innerHTML = "";
    if (extraElement) {
      document.getElementById("extra").innerHTML = extraElement;

      if (extraElement.includes(`<button id="chooseEmoji">`)) {
        const chooseEmojiBtn = document.getElementById("chooseEmoji");
        chooseEmojiBtn.onclick = () => {
          createEmojiOverlay(chooseEmojiBtn);
        };
      }
    }

    if (inputValue) {
      input.value = inputValue;
    } else {
      input.value = "";
    }

    modal.classList.add("show");
    modal.querySelector("h2").textContent = title;
    modal.querySelector("p").textContent = desc;

    input.focus();
    input.placeholder = title;

    function close(value) {
      modal.classList.remove("show");
      document.body.classList.remove("no-scroll");

      ok.onclick = null;
      cancel.onclick = null;

      resolve(value);
    }

    const ok = document.getElementById("inputOk");
    const cancel = document.getElementById("inputCancel");

    ok.style.background = red ? "#db1d23" : "white";
    ok.style.color = red ? "white" : "black";
    
    ok.onclick = () => {
      if (!input.value) return log("red", "input cannot be blank");
      close(input.value.trim() || null)
    };
    cancel.onclick = () => close(null);
  });
}

function confirmDialog(title, desc, color) {
  return new Promise(resolve => {
    if (loading.classList.contains("show")) {
      loading.classList.remove("show");
    }
    setTimeout(() => {
      document.body.classList.add("no-scroll");
    }, 1);

    const modal = document.getElementById("confirm");
    modal.classList.add("show");

    modal.querySelector("h2").textContent = title;
    modal.querySelector("p").textContent = desc;

    const ok = modal.querySelector("#confirmOk");
    const cancel = modal.querySelector("#confirmCancel");

    if (color === "red") {
      ok.style.background = "#d22d39";
      ok.style.color = "white";
    } else {
      ok.style.background = "white";
      ok.style.color = "black";
    }

    function close(result) {
      modal.classList.remove("show");
      document.body.classList.remove("no-scroll");

      ok.onclick = null;
      cancel.onclick = null;

      resolve(result);
      if (result != false) {
        loading.classList.add("show");
      }
    }

    ok.onclick = () => close(true);
    cancel.onclick = () => close(false);
  });
}

function info(image, title, desc) {
  setTimeout(() => { 
    document.body.classList.add('no-scroll');
  }, 1);
  let icon = "";
  if (image === "x") {
    icon = "/image/x.png";
  } else if (image === "check") {
    icon = "/image/check.png";
  } else if (image === "i") {
    icon = "/image/info.png"
  } else {
    icon = image;
  }
  const info = document.getElementById("info");
  info.classList.add("show");

  info.querySelector("img").src = icon;
  info.querySelector("p").textContent = desc;
  info.querySelector("h2").textContent = title;
}

function formatTime(ts) {
  if (!ts) return "";

  const date = ts.toDate();  

  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");

  return `${h}.${m}`;
}

function formatNumber(num) {
  if (num < 0 || num > 999e9) {
    return `error`;
  }

  if (num < 1000) {
    return num.toString();
  }

  const units = [
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" },
    { value: 1e3, suffix: "k" }
  ];

  for (const u of units) {
    if (num >= u.value) {
      let result = num / u.value;
      result = Math.round(result * 10) / 10;

      return (result % 1 === 0 ? result.toFixed(0) : result.toFixed(1)) + u.suffix;
    }
  }
}

export function formatNum(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function tokenize(text) {
  const lower = (text || "").toLowerCase();

  const cleaned = lower.replace(/[^a-z0-9@#'\s]+/gi, " ");

  const raw = cleaned.split(/\s+/).filter(Boolean);

  const out = new Set();
  for (const t of raw) {
    out.add(t);
    const noApos = t.replace(/['’]/g, "");
    if (noApos && noApos !== t) out.add(noApos);
  }
  return Array.from(out).slice(0, 100);
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  let date;

  if (typeof timestamp.toDate === "function") {
    date = timestamp.toDate();
  } else if (typeof timestamp === "object" && "seconds" in timestamp) {
    date = new Date(timestamp.seconds * 1000);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }

  if (!date || isNaN(date.getTime())) {
    return "now";
  }

  const diffMs = Date.now() - date.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);
  const months  = Math.floor(days / 30);
  const years   = Math.floor(days / 365);

  if (seconds < 60) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m`;
  if (hours   < 24) return `${hours}h`;
  if (days    < 30) return `${days}d`;
  if (months  < 12) return `${months}mo`;
  return `${years}yr`;
}

function linkify(text) {
  const escaped = escapeHTML(text);
  return escaped.replace(/(https:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function sanitizeBrokenHTML(html) {
  const template = document.createElement("template");
  template.innerHTML = html;

  if (template.innerHTML !== html) {
    const div = document.createElement("div");
    div.textContent = html;
    return div.innerHTML;
  }

  return html;
}

export function truncateHTML(html, maxChars) {
  const div = document.createElement("div");
  div.innerHTML = html;

  const text = div.textContent;

  if (text.length <= maxChars) return html;

  return escapeHTML(text.slice(0, maxChars)) + " ...";
}

function applyReadMoreLogic(container) {
  const posts = container.querySelectorAll(".post-body");

  posts.forEach((postBody) => {
    if (postBody.dataset.readmoreApplied) return;
    postBody.dataset.readmoreApplied = "true";

    const content = postBody.innerHTML;
    postBody.innerHTML = ""; 

    const innerWrapper = document.createElement("div");
    innerWrapper.classList.add("clamp-text");
    innerWrapper.style.display = "-webkit-box";
    innerWrapper.style.webkitBoxOrient = "vertical";
    innerWrapper.style.overflow = "hidden";
    innerWrapper.style.webkitLineClamp = 10;
    
    innerWrapper.innerHTML = content;
    postBody.appendChild(innerWrapper);

    requestAnimationFrame(() => {
      const lineHeight = parseFloat(getComputedStyle(innerWrapper).lineHeight) || 24;
      const maxHeight = lineHeight * 10;

      if (innerWrapper.scrollHeight > maxHeight + 5) {
        const btn = document.createElement("span");
        btn.textContent = "Read more";
        btn.className = "read-more";
        btn.style.fontSize = "16px";
        btn.style.display = "block";
        btn.style.cursor = "pointer";
        btn.style.color = "#19A1F2"; 
        btn.style.textAlign = "left";
        btn.style.marginTop = "10px";

        let currentLines = 10;

        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          currentLines += 10;
          innerWrapper.style.webkitLineClamp = currentLines;

          if (innerWrapper.scrollHeight <= lineHeight * currentLines + 5) {
            btn.remove();
          }
        });

        postBody.appendChild(btn);
      }
    });
  });
}

async function parseMentionsToLinks(text, mentions = {}) {
  let tokenIndex = 0;
  const tokens = {};
  const token = () => `__TOKEN_${tokenIndex++}__`;

  const urlJobs = [];

  text = text.replace(/(https:\/\/[^\s]+)/g, (match, p1, offset, string) => {
    const id = token();
    const isInternal = match.startsWith("https://wyntr.netlify.app");

    const beforeUrl = string.slice(0, offset);
    const afterUrl = string.slice(offset + match.length);
    
    const isAtStart = /^\s*$/.test(beforeUrl);
    const isAtEnd = /^\s*$/.test(afterUrl);
    
    const hasNewline = /^[ \t]*\n/.test(afterUrl);
    const isFollowedByInternal = /^[ \t\n]*https:\/\/wyntr\.netlify\.app\/[^\s]+/.test(afterUrl);

    if (isInternal && !["https://wyntr.netlify.app", "https://wyntr.netlify.app/"].includes(match)) {
      urlJobs.push({ id, match, hasNewline, isFollowedByInternal, isAtStart, isAtEnd });
    } else {
      tokens[id] = `<span><a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a></span>`;
    }

    return id;
  });

  await Promise.all(urlJobs.map(async ({ id, match, hasNewline, isFollowedByInternal, isAtStart, isAtEnd }) => {
    const url = match.replace("https://wyntr.netlify.app", "");
    const internal = await renderCard(url, match);

    const marginT = isAtStart ? "0px !important" : "10px 0";
    
    let marginB = "10px !important";
    if (isAtEnd) {
      marginB = "0px !important";
    } else if (isFollowedByInternal) {
      marginB = "0px !important";
    } else if (hasNewline) {
      marginB = "10px !important";
    }

    tokens[id] = `<div class="body-quote" style="width:100%;border:var(--border);padding:10px 14px;margin:${marginT};box-sizing:border-box;border-radius:13px;background:var(--light);margin-bottom:${marginB};word-wrap: break-word;overflow:hidden;cursor:pointer;user-select:none">
      ${internal}
    </div>`;
  }));

  for (const [displayName, uid] of Object.entries(mentions || {})) {
    const id = token();

    tokens[id] = uid
      ? `<span class="user-link" data-uid="${uid}" style="color:#04aa63; cursor:pointer">@${escapeHTML(displayName)}</span>`
      : `@${escapeHTML(displayName)}`;

    const regex = new RegExp(`@${displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    text = text.replace(regex, id);
  }

  text = text.replace(/#(\w+)/g, (match, tag) => {
    const id = token();
    tokens[id] = `<span class="tag-link" data-tag="${tag}" style="color:#04aa63; cursor:pointer">${match}</span>`;
    return id;
  });

  text = text.replace(/\|\|(.+?)\|\|/g, (_, spoilerContent) => {
    const id = token();
    tokens[id] = `<span class="spoiler-text spoilerr" onclick="this.classList.remove('spoiler-text')">${escapeHTML(spoilerContent)}</span>`;
    return id;
  });

  let parsed = escapeHTML(text);

  for (const [id, html] of Object.entries(tokens)) {
    parsed = parsed.replace(id, html);
  }

  parsed = parsed.replace(/\s*<div class="body-quote"/g, '<div class="body-quote"');
  parsed = parsed.replace(/<\/div>\s*/g, '</div>');

  parsed = parsed.replace(/(^|>)([^<]+)(?=<|$)/g, (_, before, text) => {
    if (!text.trim()) return before + text;
    return `${before}<span>${text}</span>`;
  });

  return parsed;
}

export function getDefaultLanguage() {
  return localStorage.getItem("languagePreference") || "en";
}

export function isTranslateEnabled() {
  return localStorage.getItem("isTranslateEnabled") === "true";
}

export async function detectLanguage(text) {
  const url =
    "https://translate.googleapis.com/translate_a/single" +
    "?client=gtx" +
    "&sl=auto" +
    "&tl=en" +
    "&dt=t" +
    `&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  const data = await res.json();

  return data[2] || "en";
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".translate-btn");
  if (!btn) return;

  const tweetId = btn.dataset.id;
  const random = btn.dataset.random;
  const to = btn.dataset.to;

  const container = document.getElementById(`translated-${tweetId}-${random}`);
  if (!container) return;

  if (container.dataset.loaded === "true") {
    container.style.display =
      container.style.display === "none" ? "block" : "none";
    return;
  }

  btn.textContent = "Translating…";

  const originalText = btn.dataset.text;
  let originalTitle = "";
  let text = "";

  if (btn.dataset.title && btn.dataset.title != "null" && btn.dataset.title != undefined && btn.dataset.title != null) { 
    originalTitle = `${btn.dataset.title}:`;
  }

  if (originalTitle != "") {
    text = `${originalTitle} ${originalText}`
  } else {
    text = originalText
  }

  try {
    const translated = await googleTranslate(text, to);

    container.textContent = translated;
    container.dataset.loaded = "true";
    container.style.display = "block";
    btn.remove();
  } catch (err) {
    btn.textContent = "Translate";
    container.textContent = "Translation failed";
    container.style.display = "block";
    container.style.color = "#db1d23";
  }
});

async function googleTranslate(text, targetLang) {
  const url =
    "https://translate.googleapis.com/translate_a/single" +
    "?client=gtx" +
    "&sl=auto" +
    `&tl=${encodeURIComponent(targetLang)}` +
    "&dt=t" +
    `&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  const data = await res.json();

  return data[0].map(seg => seg[0]).join("");
}

function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[<>]/g, char => ({
    "<": "&lt;",
    ">": "&gt;"
  }[char]));
}

function randomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  let result;
  do {
    result = "id_";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (document.getElementById(result));

  return result;
}

export function formatUTC8(input = new Date()) {
  if (!input) return "Unknown time";

  let date;

  if (typeof input?.toDate === "function") {
    date = input.toDate();
  } else if (input instanceof Date) {
    date = input;
  } else {
    date = new Date(input);
  }

  if (isNaN(date)) return "Invalid date";

  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const utc8 = new Date(utc + (8 * 60 * 60 * 1000));

  const day = utc8.getDate();
  const month = utc8.toLocaleString("en-US", { month: "long" });
  const year = utc8.getFullYear();

  const hours24 = utc8.getHours();
  const hours12 = hours24 % 12 || 12;
  const minutes = utc8.getMinutes().toString().padStart(2, "0");
  const ampm = hours24 >= 12 ? "PM" : "AM";

  return `${day} ${month} ${year} at ${hours12
    .toString()
    .padStart(2, "0")}:${minutes} ${ampm}`;
}

export function toDate(input, options = {}) {

  if (!input) return "";

  let date;

  if (typeof input.toDate === "function") {
    date = input.toDate();
  }
  
  else if (input instanceof Date) {
    date = input;
  }

  else if (typeof input === "number") {
    date = new Date(input);
  }

  else if (typeof input === "string") {
    date = new Date(input);
  }

  else {
    return "";
  }

  const {
    includeTime = false,
    locale = "en-US"
  } = options;

  const formatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };

  if (includeTime) {
    formatOptions.hour = "2-digit";
    formatOptions.minute = "2-digit";
  }

  return date.toLocaleString(locale, formatOptions);
}

export function isOlderThanBlankDays(createdAtTimestamp, days) {
  const postDate = createdAtTimestamp.toDate();
  const now = new Date();
  
  // ([num] days * 24 hours * 60 mins * 60 secs * 1000 ms)
  const blankDaysInMs = days * 24 * 60 * 60 * 1000;
  return (now - postDate) > blankDaysInMs;
}

export function getSuspendedUntil(duration) {
  const now = Date.now();

  const map = {
    "1d": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "2w": 14 * 24 * 60 * 60 * 1000,
    "1mo": 30 * 24 * 60 * 60 * 1000
  };

  if (duration === "permanent") return null;

  return Timestamp.fromMillis(now + map[duration]);
}

export { randomString, inputDialog, confirmDialog, log, info, tokenize, formatDate, linkify, applyReadMoreLogic, parseMentionsToLinks, escapeHTML, formatNumber, formatTime }