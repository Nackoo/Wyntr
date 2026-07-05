import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, doc, getDoc, auth } from "/script/firebase.js";

const provider = new GoogleAuthProvider();

const loginBtn = document.getElementById("loginBtn");
const loading = document.getElementById("loadingOverlay");

loginBtn.addEventListener("click", async () => {
  loginBtn.disabled = true;
  try {
    await signInWithPopup(auth, provider);
    window.location.href = "/";
  } catch (error) {
    alert("Login failed: " + error.message);
  } finally {
    loginBtn.disabled = false;
  }
});

const userLoginBtn = document.getElementById("loginWpassword");
userLoginBtn.addEventListener("click", async () => {
  const username = await inputDialog("type your username", "type your username");
  if (!username) return;
  const password = await inputDialog("type your password", "type your password");
  if (!password) return;

  userLoginBtn.disabled = true;
  loading.classList.add("show");
  try {
    const mapSnap = await getDoc(doc(db, "usernames", username));
    if (!mapSnap.exists()) return info("x", "error", "no account found with that username");

    const { email } = mapSnap.data();
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "/";
  } catch (error) {
    info("x", "failed:", error.message);
  } finally {
    userLoginBtn.disabled = false;
    loading.classList.remove("show");
  }
});

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

function inputDialog(title, desc) {
  return new Promise(resolve => {
    setTimeout(() => {
      document.body.classList.add("no-scroll");
    }, 1);

    const modal = document.getElementById("inputDialog");
    const input = document.getElementById("inputDialogValue");

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
      input.value = "";

      resolve(value);
    }

    const ok = document.getElementById("inputOk");
    const cancel = document.getElementById("inputCancel");
    
    ok.onclick = () => {
      if (!input.value) return log("red", "input cannot be blank");
      close(input.value.trim() || null)
    };
    cancel.onclick = () => close(null);
  });
}

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