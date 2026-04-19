import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, auth, db, signOut, serverTimestamp } from "./firebase.js";
import { extractMentions } from "./mention.js";
import { parseMentionsToLinks, log, confirmDialog, formatNum } from "./texts.js";
import { applyUserEffect } from "./profile.js";
import { compressImageTo480, base91ToImageSrc } from "./attachments.js";
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

avaInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  loading.classList.add("show");
  const result = await quickImageNSFWCheck(file);
  logNSFWResult("image", result);
  if (result.finalNSFW) {
    log("red", "image cannot contain NSFW");
    e.target.value = "";
    loading.classList.remove("show");
    return;
  }
  const url = URL.createObjectURL(file);
  avaPreview.style.background = `url("${url}") center / cover`;
  avaPreview.dataset.file = file;
  loading.classList.remove("show");
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
  const newDescription = descriptionInput.value.trim().slice(0, 160);

  const newBanner = bannerInput.files[0]
    ? bannerInput.files[0]
    : bannerPreview.dataset.image;

  const newAvatar = avaInput.files[0]
    ? avaInput.files[0]
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

  const newbanner = await compressImageTo480(newBanner);
  const newavatar = await compressImageTo480(newAvatar);

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
  myUsername.textContent = `@${newUsername}`;

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

document.getElementById("settingssvg").addEventListener("click", async () => { 
  const userRef = doc(db, "users", auth.currentUser.uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.data();

  document.getElementById("my-streak").textContent = userData.streak ? formatNum(userData.streak) : 0;
  document.getElementById("my-balance").textContent = userData.balance ? formatNum(userData.balance) : 0;

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
    }
    if (inviteno.checked === false) {
      inviteno.checked = true;
      log("red", "one option is required");
    }
  });

  const checkbox = document.getElementById("seeFollows");
  const checkbox1 = document.getElementById("seeCom");

  checkbox.checked = userData?.cannotSeeFollows !== true;
  checkbox.onchange = async () => {
    await updateDoc(userRef, {
      cannotSeeFollows: !checkbox.checked
    });
  };

  checkbox1.checked = userData?.cannotSeeCom !== true;
  checkbox1.onchange = async () => {
    await updateDoc(userRef, {
      cannotSeeCom: !checkbox1.checked
    });
  };
});