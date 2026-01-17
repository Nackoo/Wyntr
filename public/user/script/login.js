import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { app, auth, db, storage, initializeApp } from "/script/firebase.js";

const provider = new GoogleAuthProvider();

const loginBtn = document.getElementById("loginBtn");
const tosCheckbox = document.getElementById("tosCheckbox");
const errorEl = document.getElementById("error");

const agreed = localStorage.getItem("tosAgreed") === "true";
tosCheckbox.checked = agreed;

loginBtn.disabled = false;

loginBtn.addEventListener("click", async () => {
  if (!tosCheckbox.checked) {
    errorEl.style.display = "block";
    return;
  }

  errorEl.style.display = "none";

  try {
    await signInWithPopup(auth, provider);
    window.location.href = "/";
  } catch (error) {
    alert("Login failed: " + error.message);
  }
});

tosCheckbox.addEventListener("change", () => {
  localStorage.setItem("tosAgreed", tosCheckbox.checked);
  errorEl.style.display = "none";
});