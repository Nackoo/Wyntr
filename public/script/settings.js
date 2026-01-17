import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, auth, db, signOut, serverTimestamp } from "./firebase.js";
import { extractMentions } from "./mention.js";
import { parseMentionsToLinks, log, confirmDialog } from "./texts.js";
import { applyUserEffect } from "./profile.js";
import { compressImageTo480, dataUrlToBase91, base91ToImageSrc } from "./attachments.js";
import { quickImageNSFWCheck, logNSFWResult } from "./nsfw.js";
 
const bannerInput = document.getElementById("banner-input");
const bannerPreview = document.getElementById("banner-preview");
const avaInput = document.getElementById("ava-input");
const avaPreview = document.getElementById("ava-preview");
const nameInput = document.getElementById("name-edit");
const descriptionInput = document.getElementById("description-edit");
const saveButton = document.getElementById("save-profile-changes");
const profileSubOverlay = document.getElementById("meOverlay");
const myPfp = document.getElementById("my-pfp");
const myBanner = document.getElementById("my-banner");
const myDescription = document.querySelector("#my-description");
const myName = document.querySelector("#my-name");
const myUsername = document.querySelector("#my-username");
const usernameInput = document.getElementById("username-edit");
const displayNameInput = document.getElementById("name-edit");
const statusInput = document.getElementById("status-edit");
const loading = document.getElementById("loadingOverlay");

function escapeHTML(text) {
  return text.replace(/[&<>]/g, (match) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;'
    } [match])
  );
}

document.getElementById("logout").addEventListener("click", async () => {
  if (!(await confirmDialog('log out', 'are you sure you want to log out?', 'red'))) return;
  try {
    await signOut(auth);
    window.location.href = "/user/login";
  } catch (error) {
    console.error("Logout failed:", error);
    log("red", "logout failed")
  }
});

export function fileToBase64(file, maxSize = 200 * 1024) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      let base64 = e.target.result;
      if (base64.length > maxSize * 1.37) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const scale = Math.sqrt(maxSize / (base64.length * 0.75));
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.src = base64;
      } else {
        resolve(base64);
      }
    };
    reader.readAsDataURL(file);
  });
}

document.getElementById('openMe').addEventListener("click", async () => {
  document.getElementById("meOverlay").classList.remove("hidden");
  document.getElementById("profileMenuOverlay").classList.add("hidden");

  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const docSnap = await getDoc(doc(db, "users", uid));
  if (!docSnap.exists()) return;
  const data = docSnap.data();

  const banner = base91ToImageSrc(data.banner);
  const bannerPreview = document.getElementById("banner-preview");

  if (banner) {
    bannerPreview.style.backgroundImage = `url('${banner}')`;
    bannerPreview.dataset.image = banner;
  } else {
    bannerPreview.style.background = "url('/image/default-banner.png')";
    bannerPreview.dataset.image = "/image/default-banner.png";
  }

  bannerPreview.style.backgroundRepeat = 'no-repeat';
  bannerPreview.style.backgroundPosition = 'center';
  bannerPreview.style.backgroundSize = 'cover';
  bannerPreview.style.backgroundColor = 'unset';

  const avatarURL = base91ToImageSrc(data.photoURL) || auth.currentUser.photoURL;
  const avaPreview = document.getElementById("ava-preview");
  const status = data.status || "i'm cold";

  statusInput.value = status;

  if (avatarURL) {
    avaPreview.style.background = `url('${avatarURL}') no-repeat center / cover`;
    avaPreview.dataset.image = avatarURL;
  } else {
    avaPreview.style.background = "url('/image/default-avatar.jpg') no-repeat center / cover";
    avaPreview.dataset.image = "/image/default-avatar.jpg";
  }

  const name = data.displayName || auth.currentUser.displayName;
  document.getElementById("name-edit").value = name;

  const description = data.description || "wsg homie?";
  document.getElementById("description-edit").value = description;

  usernameInput.value = data.username;

  const effectEquippedEl = document.getElementById("effect-equipped");
  effectEquippedEl.innerHTML = "";
  const effect = data.effect || "none";

  let effectHTML = "";

  switch (effect) {
    case "002":
      effectHTML = `<img src="/image/effects/flame.gif" alt="Flame Effect" style="width:222px;height:auto;border-radius:8px;margin-top:10px">`;
      break;
    case "003":
      effectHTML = `<img src="/image/effects/rain.webp" alt="Rain Effect" style="width:222px;height:auto;border-radius:8px;margin-top:10px">`;
      break;
    case "005": 
      effectHTML = `<img src="/image/effects/earth.gif" alt="earth Effect" style="width:222px;height:auto;border-radius:8px;margin-top:10px">`;
      break;
    case "008":
      effectHTML = `<img src="/image/effects/wave.gif" alt="wave Effect" style="width:222px;height:auto;border-radius:8px;margin-top:10px">`;
      break;
    case "009":
      effectHTML = `<img src="/image/effects/fih.gif" alt="fih Effect" style="width:222px;height:auto;border-radius:8px;margin-top:10px">`;
      break;
    case "010":
      effectHTML = `<img src="/image/effects/sakura.gif" alt="sakura Effect" style="width:222px;height:auto;border-radius:8px;margin-top:10px">`;
      break;
    case "custom-001":
      effectHTML = `<img src="/image/effects/custom/phoebe.gif" alt="Phoebe Effect" style="width:222px;height:auto;border-radius:8px;margin-top:10px">`;
      break;
    default:
      effectHTML = `none`;
      break;
  }

  effectEquippedEl.innerHTML = effectHTML;
});

const changeEffectBtn = document.getElementById("change-effect");
const effectOverlay = document.getElementById("effectOverlay");
const effectOptions = document.getElementById("effectOptions");
const saveEffectBtn = document.getElementById("saveEffect");
const cancelEffectBtn = document.getElementById("cancelEffect");

let selectedEffect = null;
let effectToSave = null;

changeEffectBtn.addEventListener("click", async () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const docSnap = await getDoc(doc(db, "users", uid));
  if (!docSnap.exists()) return;
  const data = docSnap.data();

  const owned = data.effectsOwned || [];
  effectOptions.innerHTML = "";

  if (owned.length === 0) {
    effectOptions.innerHTML = `<p style="color:grey">You don't own any effects yet.</p>`;
    effectOverlay.classList.remove("hidden");
    return;
  }

  owned.forEach(effect => {
    let imgSrc = "";
    let effectName = "";
    switch (effect) {
      case "002": imgSrc = "/image/effects/flame.gif"; effectName = "flame"; break;
      case "003": imgSrc = "/image/effects/rain.webp"; effectName = "rain"; break;
      case "005": imgSrc = "/image/effects/earth.gif"; effectName = "earth"; break;
      case "008": imgSrc = "/image/effects/wave.gif"; effectName = "wave"; break;
      case "009": imgSrc = "/image/effects/fih.gif"; effectName = "fih"; break;
      case "010": imgSrc = "/image/effects/sakura.gif"; effectName = "sakura"; break;
      case "none": imgSrc = "/image/default-avatar.jpg"; effectName = "no"; break;
      case "custom-001": imgSrc = "/image/effects/custom/phoebe.gif"; effectName = "phoebe"; break;
      default: return;
    }

    const div = document.createElement("div");
    let img = "";
    img = `<img src="${imgSrc}" data-effect="${effect}" style="width:222px;height:auto;border-radius:10px;border:2px solid transparent;cursor:pointer;transition:0.2s ease">`;
    div.innerHTML = `<div class="effect-item">${img} <span style="color:grey">${effectName} profile effect<span></div>`;
    div.style.border = "2px solid #2f3336";
    div.style.borderRadius = "15px";
    div.className = "sss"
    div.style.height = "fit-content";

    div.addEventListener("click", () => {
      document.querySelectorAll("#effectOptions .sss").forEach(i => i.style.border = "2px solid #2f3336");
      div.style.border = "2px solid var(--color)";
      selectedEffect = effect;
      effectToSave = effect; 

      const equipped = document.getElementById("effect-equipped");
      equipped.innerHTML = `<img src="${imgSrc}" alt="Selected Effect" style="width:222px;height:auto;border-radius:8px;margin-top:10px">`;
    });

    effectOptions.appendChild(div);
  });

  effectOverlay.classList.remove("hidden");
});

saveEffectBtn.addEventListener("click", async () => {
  effectOverlay.classList.add("hidden");
});

usernameInput.addEventListener("input", () => {
  usernameInput.value = usernameInput.value
    .toLowerCase()
    .replace(/\s+/g, "")             
    .replace(/[^a-z0-9._-]/g, "")     
    .slice(0, 20);                    
});

displayNameInput.addEventListener("input", () => {
  displayNameInput.value = displayNameInput.value
    .slice(0, 15);
})

statusInput.addEventListener("input", () => {
  statusInput.value = statusInput.value
    .slice(0, 128);
})

bannerInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const result = await quickImageNSFWCheck(file);
  logNSFWResult("image", result);
  if (result.isNSFW) {
    log("red", "image cannot contain NSFW");
    loading.classList.remove("show");
    e.target.value = "";
    return;
  }
  const url = URL.createObjectURL(file);
  bannerPreview.style.background = `url("${url}") center / cover`;
  bannerPreview.dataset.file = file; 
});

avaInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const result = await quickImageNSFWCheck(file);
  logNSFWResult("image", result);
  if (result.isNSFW) {
    log("red", "image cannot contain NSFW");
    e.target.value = "";
    loading.classList.remove("show");
    return;
  }
  const url = URL.createObjectURL(file);
  avaPreview.style.background = `url("${url}") center / cover`;
  avaPreview.dataset.file = file;
});

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  saveButton.classList.add('disabled');
  const uid = auth.currentUser.uid;
  const newDisplayName = escapeHTML(displayNameInput.value.trim().slice(0, 15));
  const newStatus = escapeHTML(statusInput.value.trim().slice(0, 128));
  const newUsername = usernameInput.value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 20);
  const newDescription = descriptionInput.value.trim();
  const newBanner = bannerInput.files[0]
    ? await compressImageTo480(bannerInput.files[0])
    : bannerPreview.dataset.image;
  const newAvatar = avaInput.files[0]
    ? await compressImageTo480(avaInput.files[0])
    : avaPreview.dataset.image;

  if (!newDisplayName) {
    log("red", "Display name cannot be empty");
    saveButton.disabled = false;
    saveButton.classList.remove('disabled');
    return;
  }
  if (!newUsername) {
    log("red", "Username cannot be empty");
    saveButton.disabled = false;
    saveButton.classList.remove('disabled');
    return;
  }

  const usersRef = collection(db, "users");
  const querySnapshot = await getDocs(
    query(usersRef, where("username", "==", newUsername))
  );

  if (!querySnapshot.empty && querySnapshot.docs[0].id !== uid) {
    log("red", "This username is already taken");
    saveButton.disabled = false;
    saveButton.classList.remove('disabled');
    return;
  }

  const mentionsRaw = await extractMentions(newDescription);

  mentionsRaw.sort((a, b) => (b.username?.length || 0) - (a.username?.length || 0));
  const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let processedDescription = newDescription;

  const uidMatches = newDescription.match(/@[A-Za-z0-9]{20,}/g) || [];
  const validUidMentions = new Set();

  for (const raw of uidMatches) {
    const uid = raw.slice(1);
    try {
      const userSnap = await getDoc(doc(db, "users", uid));
      if (userSnap.exists()) {
        validUidMentions.add(uid);
      }
    } catch (err) {
      console.warn("Invalid @uid mention:", uid, err);
      log("red", "invalid user ID mention")
    }
  }

  for (const { username, uid } of mentionsRaw) {
    if (!username || !uid) continue;
    const regex = new RegExp(`@${escapeRegExp(username)}(?=\\s|$)`, "gi");
    processedDescription = processedDescription.replace(regex, `@${uid}`);
  }

  const mentions = [
    ...new Set([
      ...mentionsRaw.map(m => m.uid).filter(Boolean),
      ...Array.from(validUidMentions)
    ])
  ];

  const newbanner = await dataUrlToBase91(newBanner);
  const newavatar = await dataUrlToBase91(newAvatar);

  const userRef = doc(db, "users", uid);
  await setDoc(userRef, {
    displayName: newDisplayName,
    username: newUsername,
    name: newDisplayName.toLowerCase(),
    description: processedDescription,
    descriptionMentions: mentions,
    banner: newbanner,
    photoURL: newavatar,
    status: newStatus,
    ...(effectToSave && { effect: effectToSave }),
  }, { merge: true });

  profileSubOverlay.classList.add("hidden");
  saveButton.disabled = false;
  saveButton.classList.remove('disabled');

  myDescription.innerHTML = await parseMentionsToLinks(processedDescription, mentions);
  document.getElementById("my-status").textContent = newStatus;

  myName.textContent = newDisplayName;
  if (newBanner) {
    myBanner.style.backgroundImage = `url('${newBanner}')`;
  } else {
    myBanner.style.background = "url('/image/default-banner.png')";
  }

  const updatedSnap = await getDoc(userRef);
  const updatedData = updatedSnap.data();

  applyUserEffect(updatedData.effect, "#user-profile-effect");

  myBanner.style.backgroundRepeat = "no-repeat";
  myBanner.style.backgroundPosition = "center";
  myBanner.style.backgroundSize = "cover";
  myBanner.style.backgroundColor = "unset";

  myPfp.style.background = `url('${newAvatar || auth.currentUser.photoURL}') no-repeat center / cover`;

  document.querySelector(".account-avatar").src = newAvatar || auth.currentUser.photoURL;
  document.querySelector(".account-name").textContent = newDisplayName;
  myUsername.textContent = `@${newUsername}`;
});

document.getElementById("banner-delete").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const userRef = doc(db, "users", uid);

  bannerPreview.style.background = "url('/image/default-banner.png')";
  bannerPreview.dataset.image = "/image/default-banner.png";

  bannerPreview.style.backgroundRepeat = "no-repeat";
  bannerPreview.style.backgroundPosition = "center";
  bannerPreview.style.backgroundSize = "cover";
  bannerPreview.style.backgroundColor = "unset";
});