import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, auth, db, signOut, serverTimestamp } from "./firebase.js";
import { extractMentions } from "./mention.js";
import { parseMentionsToLinks, log, confirmDialog, formatNum, inputDialog, info } from "./texts.js";
import { applyUserEffect } from "./profile.js";
import { compressImageTo480, base91ToImageSrc, uploadMedia } from "./attachments.js";
import { quickImageNSFWCheck, logNSFWResult } from "./nsfw.js";
import { EmailAuthProvider, linkWithCredential, updatePassword, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
 
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
  if (localStorage.getItem("disableConfirmation") != "true") {
    if (!(await confirmDialog('log out', 'are you sure you want to log out?', 'red'))) return;
  }
  
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
});

displayNameInput.addEventListener("input", () => {
  displayNameInput.value = displayNameInput.value
    .slice(0, 15);
})

statusInput.addEventListener("input", () => {
  statusInput.value = statusInput.value
    .slice(0, 128);
})

descriptionInput.addEventListener("input", () => {
  descriptionInput.value = descriptionInput.value
    .slice(0, 160);
})

bannerInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  loading.classList.add("show");
  const result = await quickImageNSFWCheck(file);
  logNSFWResult("image", result);
  if (result.finalNSFW) {
    log("red", "image cannot contain NSFW");
    loading.classList.remove("show");
    e.target.value = "";
    return;
  }
  const url = URL.createObjectURL(file);
  bannerPreview.style.background = `url("${url}") center / cover`;
  bannerPreview.dataset.file = file; 
  loading.classList.remove("show");
});

avaInput.addEventListener("click", async (e) => {
  const base91 = await uploadMedia({
    allowImage: true,
    allowGif: false
  });
  avaPreview.style.background = `url("${base91ToImageSrc(base91)}") center / cover`;
  avaPreview.dataset.image = base91;
});

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  saveButton.classList.add('disabled');
  const uid = auth.currentUser.uid;
  const newDisplayName = escapeHTML(displayNameInput.value.trim().slice(0, 15));
  const newStatus = escapeHTML(statusInput.value.trim().slice(0, 128));
  const newDescription = descriptionInput.value.trim().slice(0, 160);

  const newBanner = bannerInput.files[0]
    ? bannerInput.files[0]
    : bannerPreview.dataset.image;

  const newAvatar = avaPreview.dataset.image;

  if (!newDisplayName) {
    log("red", "Display name cannot be empty");
    saveButton.disabled = false;
    saveButton.classList.remove('disabled');
    return;
  }

  const mentions = await extractMentions(newDescription);

  const uidMatches = newDescription.match(/@[A-Za-z0-9]{20,}/g) || [];

  for (const raw of uidMatches) {
    const uid = raw.slice(1);
    try {
      const userSnap = await getDoc(doc(db, "users", uid));
      if (userSnap.exists()) {
        mentions[uid] = uid;
      }
    } catch (err) {
      console.warn("Invalid @uid mention:", uid, err);
      log("red", "invalid user ID mention")
    }
  }

  const processedDescription = newDescription;

  const newbanner = await compressImageTo480(newBanner);
  const newavatar = await compressImageTo480(newAvatar);

  const userRef = doc(db, "users", uid);
  await setDoc(userRef, {
    displayName: newDisplayName,
    name: newDisplayName.toLowerCase(),
    description: processedDescription,
    descriptionMentions: mentions,
    banner: newbanner,
    photoURL: newavatar,
    status: newStatus,
  }, { merge: true });

  profileSubOverlay.classList.add("hidden");
  saveButton.disabled = false;
  saveButton.classList.remove('disabled');

  myDescription.innerHTML = await parseMentionsToLinks(processedDescription, mentions);
  document.getElementById("my-status").textContent = newStatus;

  myName.textContent = newDisplayName;

  const updatedSnap = await getDoc(userRef);
  const updatedData = updatedSnap.data();

  applyUserEffect(updatedData.effect, "#user-profile-effect");

  myPfp.style.background = `url('${base91ToImageSrc(newAvatar) || auth.currentUser.photoURL}') no-repeat center / cover`;

  document.querySelector(".account-avatar").src = base91ToImageSrc(newAvatar) || auth.currentUser.photoURL;
  document.querySelector(".account-name").textContent = newDisplayName;

  if (updatedData.banner) {
    myBanner.style.backgroundImage = `url('${base91ToImageSrc(updatedData.banner)}')`;
  } else {
    myBanner.style.backgroundImage = "url('/image/default-banner.png')";
  }

  myBanner.style.backgroundRepeat = 'no-repeat';
  myBanner.style.backgroundPosition = 'center';
  myBanner.style.backgroundSize = 'cover';
  myBanner.style.backgroundColor = 'unset';
});

document.getElementById("banner-delete").addEventListener("click", async () => {
  bannerPreview.style.background = "url('/image/default-banner.png')";
  bannerPreview.dataset.image = "/image/default-banner.png";
  bannerInput.value = "";

  bannerPreview.style.backgroundRepeat = "no-repeat";
  bannerPreview.style.backgroundPosition = "center";
  bannerPreview.style.backgroundSize = "cover";
  bannerPreview.style.backgroundColor = "unset";
});

const inviteeveryone = document.getElementById("inviteEveryone");
const invitefollow = document.getElementById("inviteFollow");
const inviteno = document.getElementById("inviteNo"); 
const privateLike = document.getElementById("privateLikes");
const privateView = document.getElementById("privateView");

document.getElementById("settingssvg").addEventListener("click", async () => { 
  const userRef = doc(db, "users", auth.currentUser.uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.data();

  document.getElementById("my-streak").textContent = userData.streak ? formatNum(userData.streak) : 0;
  document.getElementById("my-balance").textContent = userData.balance ? formatNum(userData.balance) : 0;

  window.currentUsername = userData.username;

  if (!userData.invitePermission || userData.invitePermission === "everyone") {
    inviteeveryone.checked = true;
    invitefollow.checked = false;
    inviteno.checked = false;
  } else if (userData.invitePermission === "follow") {
    invitefollow.checked = true;
    inviteno.checked = false;
    inviteeveryone.checked = false;
  } else if (userData.invitePermission === "no") {
    inviteno.checked = true;
    invitefollow.checked = false;
    inviteeveryone.checked = false;
  }

  inviteeveryone.addEventListener("change", async () => {
    if (inviteeveryone.checked === true) {
      invitefollow.checked = false;
      inviteno.checked = false;

      await updateDoc(userRef, {
        invitePermission: "everyone"
      });
      log("green", "setting updated");
    }
    if (inviteeveryone.checked === false) {
      inviteeveryone.checked = true;
      log("red", "one option is required");
    }
  });

  invitefollow.addEventListener("change", async () => {
    if (invitefollow.checked === true) {
      inviteeveryone.checked = false;
      inviteno.checked = false;

      await updateDoc(userRef, {
        invitePermission: "follow"
      });
      log("green", "setting updated");
    }
    if (invitefollow.checked === false) {
      invitefollow.checked = true;
      log("red", "one option is required");
    }
  });

  inviteno.addEventListener("change", async () => {
    if (inviteno.checked === true) {
      invitefollow.checked = false;
      inviteeveryone.checked = false;

      await updateDoc(userRef, {
        invitePermission: "no"
      });
      log("green", "setting updated");
    }
    if (inviteno.checked === false) {
      inviteno.checked = true;
      log("red", "one option is required");
    }
  });

  const checkbox = document.getElementById("seeFollows");
  const checkbox1 = document.getElementById("seeCom");
  const checkbox2 = document.getElementById("seeFollowers");

  checkbox.checked = userData?.cannotSeeFollows !== true;
  checkbox.onchange = async () => {
    await updateDoc(userRef, {
      cannotSeeFollows: !checkbox.checked
    });
    log("green", "setting updated");
  };

  checkbox2.checked = userData?.cannotSeeFollowers !== true;
  checkbox2.onchange = async () => {
    await updateDoc(userRef, {
      cannotSeeFollowers: !checkbox2.checked
    });
    log("green", "setting updated");
  };

  checkbox1.checked = userData?.cannotSeeCom !== true;
  checkbox1.onchange = async () => {
    await updateDoc(userRef, {
      cannotSeeCom: !checkbox1.checked
    });
    log("green", "setting updated");
  };

  privateLike.checked = userData?.privateLikes !== true;
  privateLike.onchange = async() => {
    await updateDoc(userRef, {
      privateLikes: !privateLike.checked
    });
    log("green", "setting updated");
  }

  privateView.checked = userData?.privateView !== true;
  privateView.onchange = async() => {
    await updateDoc(userRef, {
      privateView: !privateView.checked
    });
    log("green", "setting updated");
  }
});

const ist = document.getElementById("isT");
const lp = document.getElementById("lp");
const langSelect = document.getElementById("language-select");

const isT = localStorage.getItem("isTranslateEnabled") || false;

if (isT != "false" && isT != false) {
  ist.checked = true;
} else {
  ist.checked = false;
}

if (isT === "true") {
  lp.style.display = "block";
} else {
  lp.style.display = "none";
}

ist.addEventListener("change", () => {
  const enabled = ist.checked;
  localStorage.setItem("isTranslateEnabled", enabled.toString());
  
  if (enabled) {
    lp.style.display = "block";
  } else {
    lp.style.display = "none";
  }
});

const savedLang = localStorage.getItem("languagePreference") || "en";
langSelect.value = savedLang;

langSelect.addEventListener("change", () => {
  const langCode = langSelect.value;
  localStorage.setItem("languagePreference", langCode);
  console.log("Language preference set to:", langCode);
});

const setd = document.getElementById("setD");
let hasclicked = false;
const b = document.getElementById("B");

b.style.display = "none";
setd.style.transform  = "rotate(-180deg)";
hasclicked = false;

setd.onclick = () => { 
  if (!hasclicked) {
    b.style.display = "block";
    setd.style.transform  = "rotate(-90deg)";
    hasclicked = true;
  } else {
    b.style.display = "none";
    setd.style.transform  = "rotate(-180deg)";
    hasclicked = false;
  }
}

const devmodecheckbox = document.getElementById("devmode");
const devmode = localStorage.getItem("developerMode") || false;

if (devmode != "false" && devmode != false) {
  devmodecheckbox.checked = true;
} else {
  devmodecheckbox.checked = false;
}

devmodecheckbox.addEventListener("change", () => {
  const enabled = devmodecheckbox.checked;
  localStorage.setItem("developerMode", enabled.toString());
});

const changeusername = document.getElementById("change-username");
changeusername.addEventListener("click", async () => {
  let username = await inputDialog("type a new username", "username can only contain lowercase letters from a-z, numbers from 0-9, ., _, -, no spaces, and no longer than 20 characters", null, "", false, true);

  const newUsername = username
    .toLowerCase()
    .replace(/\s+/g, "")             
    .replace(/[^a-z0-9._-]/g, "")     
    .slice(0, 20); 

  if (newUsername == "") return info("x", "invalid", "username cannot be empty");
  if (username != newUsername) {
    if (!(await confirmDialog(
      `your username is "${newUsername}"`,
      "we've changed your username to meet our criteria. do you wish to proceed?",
      "red"
    ))) return;
  }  

  changeusername.disabled = true;
  changeusername.classList.add("disabled");
  loading.classList.add("show");

  try {
    if (newUsername == window.currentUsername) return info("x", "failed", "Username has to be different than the current one");

    const querySnapshot = await getDocs(
      query(collection(db, "users"), 
        where("username", "==", newUsername)
      )
    );

    if (!querySnapshot.empty && querySnapshot.docs[0].id !== auth.currentUser.uid) return info("x", "failed", "This username is already taken");

    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      username: newUsername
    });

    info("check", "username changed successfully", `your username is now "${newUsername}"`);
    window.currentUsername = newUsername;
  } finally {
    changeusername.disabled = false;
    changeusername.classList.remove("disabled");
    loading.classList.remove("show");
  }
})

const setPasswordBtn = document.getElementById("save-password-btn");
setPasswordBtn.addEventListener("click", async () => {
  const password = await inputDialog("set a new password", "password must be at least 8 characters", "<img src=/image/eye.svg id=viewPW>")
  if (password.length < 8) return log("red", "password must be at least 8 characters");

  const confirm = await inputDialog("re-type your new password", "password must match", "<img src=/image/eye.svg id=viewPW>")
  if (password !== confirm) return log("red", "passwords don't match");

  const user = auth.currentUser;
  const email = user.email;
  if (!email) return log("red", "no email on this account, can't set a password");

  setPasswordBtn.disabled = true;
  setPasswordBtn.classList.add("disabled");
  try {
    const cred = EmailAuthProvider.credential(email, password);
    try {
      await linkWithCredential(user, cred);
    } catch (err) {
      if (err.code === "auth/provider-already-linked") {
        const oldPassword = await inputDialog("confirm your current password", "confirm your current password to update your password", "<img src=/image/eye.svg id=viewPW>");
        const reauthCred = EmailAuthProvider.credential(user.email, oldPassword);
        await reauthenticateWithCredential(user, reauthCred);
        await updatePassword(user, password);
      } else throw err;
    }

    loading.classList.add("show");
    const snap = await getDoc(doc(db, "users", user.uid));
    const username = snap.data().username;
    await setDoc(doc(db, "usernames", username), { email }, { merge: true });
    loading.classList.remove("show");

    info("check", "password set", "you can now log in with your new username and password");
  } catch (err) {
    if (err.code === "auth/requires-recent-login") {
      info("x", "failed:", "please log out and back in, then try again");
    } else {
      info("x", "failed:", err.message);
    }
  } finally {
    setPasswordBtn.disabled = false;
    setPasswordBtn.classList.remove("disabled");
  }
});