import { auth, db, doc, getDoc, updateDoc, collection, setDoc, arrayUnion, increment, getDocs, query, orderBy, limit, arrayRemove, deleteDoc, where, startAfter, runTransaction, Timestamp, serverTimestamp } from "./firebase.js";
import { fileToBase64 } from "./settings.js";
import { sendadminDismissedNotification, sendCommunityJoinRequest, sendCommunityWarningNotification, sendAdminNotification, sendInviteNotification } from "./notification.js";
import { renderTweet, getUserData, loadComments } from "./index.js";
import { discord } from "./moderation.js";
import { tokenize, escapeHTML, formatDate, formatNumber, parseMentionsToLinks, info, log, inputDialog, confirmDialog, formatUTC8 } from "./texts.js";
import { quickImageNSFWCheck, logNSFWResult, dataUrlToBase91, base91ToImageSrc, uploadMedia, compressImageTo480 } from "./attachments.js";
import { openUserSubProfile } from "./user.js";
import { renderTweetViewer } from "./tweetViewer.js";
import { updatePostZIndex, updateCbDisplay } from "./main.js";
import { initArchiveViewer } from "./archive.js";
import { COMMUNITIES_SKELETON, communityoverlay, USERS_SKELETON, TWEETS_SKELETON } from "./element.js"; 

let lastCommunityDoc          = null;
let hasMoreCommunities        = true;
let editingId                 = null;
let lastVisibleCommunityTweet = null;
let isLoadingCommunityTweets  = false;
let noMoreCommunityTweets     = false;
let selectedTags              = [];
let refreshTagUI              = () => {};
let tagBoxes                  = [];
let rules                     = []; 
let loadingComList            = false;
let loadingMyCom              = false;
let memberQuery               = "";
let banQuery                  = "";

window.communityID            = null;
window.isOnPrivate            = false;

const searchcom               = document.getElementById("searchCom");
const searchMyCom             = document.getElementById("searchMyCom");
const loading                 = document.getElementById("loadingOverlay");

import { communityfilled, communitysvg, searchsvg, searchfilled, homefilled, homesvg } from "./nonsense.js";

function closecom() {
  communityfilled.classList.add("hidden");
  searchsvg.classList.add("hidden");
  communitysvg.classList.remove("hidden");
  searchfilled.classList.remove("hidden");
  homefilled.classList.add("hidden");
  homesvg.classList.remove("hidden");
}

function addRuleRow(title = "", description = "") {
  if (rules.length >= 10) {
    log("red", "You can only add up to 10 rules");
    return;
  }

  const index = rules.length;
  rules.push({ title, description });

  const ruleDiv = document.createElement("div");
  ruleDiv.className = "rule-item";
  ruleDiv.dataset.index = index;

  ruleDiv.innerHTML = `
    <input class="rule-title" maxlength="50" placeholder="Rule title" value="${escapeHTML(title)}" />
    <textarea class="rule-desc" maxlength="200" placeholder="Rule description">${escapeHTML(description)}</textarea>
    <button class="removeRuleBtn">
      <img src="/image/trash.svg">
    </button>
  `;

  ruleDiv.querySelector(".rule-title").oninput = e => {
    const i = Number(ruleDiv.dataset.index);
    rules[i].title = e.target.value;
  };

  ruleDiv.querySelector(".rule-desc").oninput = e => {
    const i = Number(ruleDiv.dataset.index);
    rules[i].description = e.target.value;
  };

  ruleDiv.querySelector(".removeRuleBtn").onclick = () => {
    const i = Number(ruleDiv.dataset.index);
    rules.splice(i, 1);
    ruleDiv.remove();
    rebuildIndexes();
  };

  const TITLE_LIMIT = 50;
  const DESC_LIMIT = 200;

  ruleDiv.querySelector(".rule-title").oninput = e => {
    const i = Number(ruleDiv.dataset.index);
    let value = e.target.value;

    if (value.length > TITLE_LIMIT) {
      value = value.slice(0, TITLE_LIMIT);
      e.target.value = value;
    }

    rules[i].title = value;
  };

  ruleDiv.querySelector(".rule-desc").oninput = e => {
    const i = Number(ruleDiv.dataset.index);
    let value = e.target.value;

    if (value.length > DESC_LIMIT) {
      value = value.slice(0, DESC_LIMIT);
      e.target.value = value;
    }

    rules[i].description = value;
  };

  document.getElementById("rulesList").appendChild(ruleDiv);
}

function rebuildIndexes() {
  const TITLE_LIMIT = 50;
  const DESC_LIMIT = 200;

  const newRules = [];

  document.querySelectorAll(".rule-item").forEach((item, i) => {
    item.dataset.index = i;

    let title = item.querySelector(".rule-title").value;
    let description = item.querySelector(".rule-desc").value;

    title = title.slice(0, TITLE_LIMIT);
    description = description.slice(0, DESC_LIMIT);

    item.querySelector(".rule-title").value = title;
    item.querySelector(".rule-desc").value = description;

    newRules.push({ title, description });
  });

  rules = newRules;
}

document.querySelectorAll(".tab5").forEach(tab5 => {
  tab5.addEventListener("click", () => {
    document.querySelectorAll(".tab5").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
    tab5.classList.add("active");
    document.getElementById(tab5.dataset.target).classList.remove("hidden");

    const tabTarget = tab5.dataset.target;

    if (tabTarget === "communityList") {
      loadingComList = true;
      loadCommunities();
      loadingComList = false;
      searchcom.classList.remove("hidden");
      searchMyCom.classList.add("hidden");
    } else if (tabTarget == "myCommunities") {
      loadingMyCom = true;
      loadMyCommunities();
      loadingMyCom = false;
      searchcom.classList.add("hidden");
      searchMyCom.classList.remove("hidden");
    }
  });
});

let myComOffset = 0;
let myComLastDoc = null;
const MY_COM_PAGE_SIZE = 5;

export async function loadMyCommunities(reset = false) {

  const container = document.getElementById("myCommunities");
  const user = auth.currentUser;

  if (!user) {
    log("red", "user isn't logged in");
    return;
  }

  if (reset) {
    myComLastDoc = null;
    container.innerHTML = COMMUNITIES_SKELETON;
  }

  let q;

  if (!myComLastDoc) {
    q = query(
      collection(db, "communities"),
      where("members", "array-contains", user.uid),
      orderBy("lastActivity", "desc"),
      limit(MY_COM_PAGE_SIZE)
    );
  } else {
    q = query(
      collection(db, "communities"),
      where("members", "array-contains", user.uid),
      orderBy("lastActivity", "desc"),
      startAfter(myComLastDoc),
      limit(MY_COM_PAGE_SIZE)
    );
  }

  const snap = await getDocs(q);

  if (snap.empty && !myComLastDoc) {
    container.innerHTML = `
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No communities joined — yet</h2><p style="color:grey;margin:7px 0;">looks like you're not joined to any community. Discover it and start your journey.</p></div></div>
    `;
    return;
  }

  myComLastDoc = snap.docs[snap.docs.length - 1];

  for (const docSnap of snap.docs) {

    const id = docSnap.id;
    const cData = docSnap.data();

    const div = document.createElement("div");
    div.className = "com-item";
    div.dataset.id = id;
    div.id = `community-${id}`;

    const tagsHtml = (cData.tags || [])
      .map(t => `<span class="tag-badge">${escapeHTML(t)}</span>`)
      .join("");

    div.innerHTML = `
      <div>
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:9px;">
          <div id="com-avatar"
               style="min-height:47px;min-width:47px;max-height:43px;max-width:45px;
               margin-top:4px;border-radius:10px;
               background:url('${base91ToImageSrc(cData.avatar) || "/image/default.png"}')
               no-repeat center / cover">
          </div>
          <div style="display:flex;gap:3px;flex-direction:column;max-width:300px;overflow:hidden;">
            <strong style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;margin-bottom:3px" id="com-name">
              ${escapeHTML(cData.name)}
            </strong>
            <span id="com-desc" style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
              ${escapeHTML(cData.description) || `<span style="color:grey">No description</span>`}
            </span>
          </div>
          <img src="/image/loader.svg" height="20" style="margin-left:auto;" class="hidden">
        </div>

        <span style="color:grey;font-size:14px;display:flex;gap:5px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
          ${formatNumber(cData.posts)} posts •
          by @${escapeHTML(cData.creatorName)} •
          ${formatNumber(cData.membersCount)} members
          ${cData.private ? `• private` : ""}
        </span>

        ${tagsHtml}
      </div>
    `;

    if (!container.querySelector(`#community-${id}`)) {
      if (!container.querySelector(".com-item")) container.innerHTML = "";
      container.appendChild(div);
    }
  }
}

document.querySelector(".create-community-btn").addEventListener("click", showCreateCommunityOverlay);

async function showCreateCommunityOverlay(communityId = null) {
  editingId = communityId                               ;
  const old = document.getElementById("createCommunity");
  if (old) old.remove();

  const overlay               = document.createElement("div");
  overlay.id                  = "createCommunity"            ;
  overlay.className           = "useroverlay"                ;
  overlay.style.pointerEvents = "none"                       ;

  overlay.innerHTML = communityoverlay;
  document.body.appendChild(overlay);

  rules = []; 
  document.getElementById("rulesList").innerHTML = "";

  const bannerInput   = document.getElementById("com-banner-input")  ;
  const avaInput      = document.getElementById("com-ava-input")     ;
  const bannerPreview = document.getElementById("com-banner-preview");
  const avaPreview    = document.getElementById("com-ava-preview")   ;

  selectedTags = [];

  tagBoxes = overlay.querySelectorAll(".tagBox");

  refreshTagUI = function () {
      tagBoxes.forEach(box => {
      const tag = box.dataset.tag;
      if (selectedTags.includes(tag)) box.classList.add("selected");
      else box.classList.remove("selected");
    });
  }

  document.getElementById("addRuleBtn").onclick = () => addRuleRow();

  tagBoxes.forEach(box => {
    box.addEventListener("click", () => {
      const tag = box.dataset.tag;

      if (selectedTags.includes(tag)) {
        selectedTags = selectedTags.filter(t => t !== tag);
        refreshTagUI();
        return;
      }
      if (selectedTags.length >= 3) {
        selectedTags.shift(); 
      }
      selectedTags.push(tag);
      refreshTagUI();
    });
  });

  bannerInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const result = await quickImageNSFWCheck(file);
    logNSFWResult("image", result);
    if (result.finalNSFW) {
      log("red", "image contains NSFW");
      loading.classList.remove("show");
      return;
    }
    const base64 = await fileToBase64(file);
    bannerPreview.style.background = `url("${escapeHTML(base64)}") no-repeat center / cover`;
    bannerPreview.dataset.image = base64;
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

  /*
  avaInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const result = await quickImageNSFWCheck(file);
    logNSFWResult("image", result);
    if (result.finalNSFW) {
      log("red", "image contains NSFW");
      loading.classList.remove("show");
      return;
    }
    const base64 = await fileToBase64(file);
    avaPreview.style.background = `url("${escapeHTML(base64)}") no-repeat center / cover`;
    avaPreview.dataset.image = base64;
    loading.classList.remove("show");
  });
  */

  const nameInput = document.getElementById("communityNameInput")
  nameInput.addEventListener("input", () => {
  nameInput.value = nameInput.value
    .slice(0, 30);                    
  });

  const descInput = document.getElementById("communityDescInput")
  descInput.addEventListener("input", () => {
  descInput.value = descInput.value
    .slice(0, 300);                    
  });

  document.getElementById("cancelCreateCommunityBtn").addEventListener("click", () => overlay.remove());

document.getElementById("createCommunityBtn").onclick = async () => {
  rebuildIndexes();

  const user     = auth.currentUser          ;
  const userRef  = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef)     ;
  const userData = userSnap.data()           ;
  const balance  = userData?.balance || 0    ;

  if (typeof editingId !== "string" || !editingId) {
    if (balance < 300) return log("red", "Not enough Wcoins (need 300)");
  }

  const btn    = document.getElementById("createCommunityBtn");
  btn.disabled = true                                         ;
  btn.classList.add("disabled");

  const nameInput = document.getElementById("communityNameInput").value.trim()       ;
  const comName   = nameInput.slice(0, 30)                                           ;
  const lowerName = comName.toLowerCase()                                            ;
  const desc      = document.getElementById("communityDescInput").value.slice(0, 300);

  if (!comName) {
    log("red", "Community name cannot be blank");
    btn.disabled = false;
    btn.classList.remove("disabled");
    return;
  }

  const nameCheckQuery = query(
    collection(db, "communities"),
    where("lowerCase", "==", lowerName)
  );
  const nameSnap = await getDocs(nameCheckQuery);

  if (
    (!editingId && !nameSnap.empty) ||
    (editingId && nameSnap.docs.some(doc => doc.id !== editingId))
  ) {
    log("red", "community with that name already exists");
    btn.disabled = false;
    btn.classList.remove("disabled");
    return;
  }

  if (typeof editingId !== "string" || !editingId) {
    const banner = document.getElementById("com-banner-preview").dataset.image || "/image/default-banner.png";
    const avatar = document.getElementById("com-ava-preview").dataset.image 
      ? await compressImageTo480(document.getElementById("com-ava-preview").dataset.image) 
      : "/image/default-avatar.jpg";

    const displayName = userData?.username || "Unknown";

    const communityRef = doc(collection(db, "communities"));
    const acceptingApplications = document.getElementById("acceptApplicationCheck")?.checked || false;
    const private1 = document.getElementById("privateCheck")?.checked || false;
    const onlyAdmins = document.getElementById("onlyAdmins")?.checked || false;
    const followersOnly = document.getElementById("followersOnly")?.checked || false;

    if (localStorage.getItem("disableConfirmation") != "true") {
      if (!(await confirmDialog("Create community?", "A non-refundable 300 Wcoins from your balance will be deducted"))) {
        btn.disabled = false;
        btn.classList.remove("disabled");
        return;
      }
    }

    await runTransaction(db, async (tx) => {
      tx.set(communityRef, {
        id: communityRef.id,
        name: comName,
        lowerCase: comName.toLowerCase(),
        description: desc,
        creatorId: user.uid,
        creatorName: displayName,
        createdAt: Date.now(),
        banner,
        avatar,
        members: arrayUnion(user.uid),
        posts: 0,
        lastActivity: serverTimestamp(),
        membersCount: 1,
        acceptingApplications,
        private: private1,
        tags: selectedTags,
        rules: rules,
        onlyAdmins,
        followersOnly
      });

      const memberRef = doc(db, "communities", communityRef.id, "members", auth.currentUser.uid);

      tx.set(memberRef, {
        uid: user.uid,
        joinedAt: new Date(),
        contributions: 1,
        photoURL: userData.photoURL,
        username: userData.username,
        displayName: userData.displayName,
        name: userData.displayName.toLowerCase(),
        role: 3,
        status: "public"
      });

      tx.update(userRef, {
        balance: increment(-300),
        communitiesCount: increment(1)
      });
    });
  
    openCommunity(communityRef.id)
    log("green", "Community created successfully");
    loading.classList.remove("show");
    overlay.remove();
    btn.disabled = false;
    btn.classList.remove("disabled");
    document.getElementById("myCommunities").classList.remove("hidden");
    document.getElementById("communityList").classList.add("hidden");
    document.querySelector(`.tab5[data-target="communityList"]`).classList.remove("active");
    document.querySelector(`.tab5[data-target="myCommunities"]`).classList.add("active");
    searchcom.classList.add("hidden");
    searchMyCom.classList.remove("hidden");
    loadingMyCom = true;
    await loadMyCommunities();
    loadingMyCom = false;
  } else {
    const comRef  = doc(db, "communities", editingId);
    const comSnap = await getDoc(comRef)             ;

    if (!comSnap.exists()) {
      log("Red", "Community not found");
      btn.disabled = false;
      btn.classList.remove("disabled");
      return;
    }

    const cData         = comSnap.data();
    const bannerPreview = document.getElementById("com-banner-preview");
    const avaPreview    = document.getElementById("com-ava-preview");
    const private1 = document.getElementById("privateCheck")?.checked || false;
    const onlyAdmins = document.getElementById("onlyAdmins")?.checked || false;

    const bannerImage = bannerPreview.dataset.image
      ? await dataUrlToBase91(bannerPreview.dataset.image)
      : cData.banner;

    const avatarImage = avaPreview.dataset.image
      ? await compressImageTo480(avaPreview.dataset.image)
      : cData.avatar;

    await updateDoc(comRef, {
      name: comName,
      lowerCase: lowerName,
      description: desc,
      banner: bannerImage,
      avatar: avatarImage,
      acceptingApplications: document.getElementById("acceptApplicationCheck").checked,
      private: private1,
      onlyAdmins,
      tags: selectedTags,
      rules: rules,
    });

    const comitem1 = document.querySelector(`.com-item#yanto-${editingId}`);
    const comitem = document.querySelector(`.com-item#community-${editingId}`);
    const comitem2 = document.querySelector(`.communityo .user-box`);

    if (comitem) {
      comitem.querySelector("#com-avatar").src = base91ToImageSrc(avatarImage) || "/image/default-avatar.jpg";
      comitem.querySelector("#com-name").textContent = comName;
      comitem.querySelector("#com-desc").textContent = desc || "no description";
    }

    if (comitem1) {
      comitem1.querySelector("#com-avatar1").src = base91ToImageSrc(avatarImage) || "/image/default-avatar.jpg";
      comitem1.querySelector("#com-name1").textContent = comName;
      comitem1.querySelector("#com-desc1").textContent = desc || "no description";
    }

    if (comitem2) {
      comitem2.querySelector("#com-avatar2").src = base91ToImageSrc(bannerImage);
      comitem2.querySelector("#com-name2").textContent = comName;
      comitem2.querySelector("#com-desc2").textContent = desc || "no description";
    }

    const ruleSection = document.getElementById("comRule");
    const ruleContainer = document.getElementById("communityRules");

    if (window.innerWidth > 700) {
      const communitysnap = await getDoc(comRef);
      const cData = communitysnap.data();

      if (cData.rules && Array.isArray(cData.rules) && cData.rules.length > 0) {
        ruleSection.style.display = "block"; 
        ruleContainer.innerHTML = ""; 

        for (let i = 0; i < cData.rules.length; i++) {
          const r = cData.rules[i];
          const div = document.createElement("div");

          const parsedDesc = await parseMentionsToLinks(r.description);

          div.innerHTML = `
            <div class="ruleGroup">
              <div class="ruleNum" style="font-size:22px">${i + 1}.</div>
              <strong class="ruleTitle" style="font-size:20px">${escapeHTML(r.title)}</strong>
            </div>
            <div class="ruleDesc" style="font-size:16px">${parsedDesc}</div>
          `;

          ruleContainer.appendChild(div);
        }

      } else {
        ruleSection.style.display = "none";
      }
    }

    log("green", "Changes saved");
  }
    overlay.remove()                ;
    btn.disabled = false            ;
    editingId    = null             ;
    btn.classList.remove("disabled");
  };
}

export async function loadCommunities(reset = false) {
  const container = document.getElementById("communityList");

  if (reset) {
    container.innerHTML = COMMUNITIES_SKELETON;
    lastCommunityDoc    = null;
    hasMoreCommunities  = true;
  }

  if (!hasMoreCommunities) return;

  const user = auth.currentUser;
  if (!user) return;

  let queryRef = collection(db, "communities");
  let q = lastCommunityDoc
    ? query(queryRef, 
        orderBy("membersCount", "desc"), 
        where("private", "!=", true),
        startAfter(lastCommunityDoc), 
        limit(10)
      )
    : query(queryRef, 
        orderBy("membersCount", "desc"),
        where("private", "!=", true),
        limit(10)
      );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    if (container.innerHTML === "") container.innerHTML = "<p>No communities found</p>";
    hasMoreCommunities = false;
    return;
  }

  lastCommunityDoc = snapshot.docs[snapshot.docs.length - 1];

  for (const comm of snapshot.docs) {
    const cData  = comm.data();

    const comMembers = cData?.members || [];
    const joined = comMembers.includes(user.uid);

    let joinedStatus = joined
      ? `
        <div style="margin-left:auto;display:flex;align-items:center;gap:5px;">
          <div style="color:grey;font-size:14px;">Joined</div>
          <img src="/image/loader.svg" height="20" class="hidden">
        </div>
        `
      : `
      <img style="margin-left:auto" src="/image/loader.svg" height="20" class="hidden">
      `;

    const wrapper      = document.createElement("div");
    wrapper.className  = "com-item";
    wrapper.dataset.id = cData.id;
    wrapper.id = `yanto-${cData.id}`;

    const tagsHtml = (cData.tags || [])
      .map(t => `<span class="tag-badge">${escapeHTML(t)}</span>`)
      .join("");

    wrapper.innerHTML  = `
      <div>
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:9px;">
          <div style="min-height:47px;min-width:47px;max-height:43px;max-width:45px;margin-top:4px;border-radius:10px;background:url('${base91ToImageSrc(cData.avatar) || '/image/default.png'}') no-repeat center / cover" id="com-avatar1"></div>
          <div style="display:flex;gap:3px;flex-direction:column;max-width:300px;overflow:hidden;">
            <strong style="margin-bottom:3px;" id="com-name1">${escapeHTML(cData.name)}</strong>
            <span style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;" id="com-desc1">${escapeHTML(cData.description) || `<span style="color:grey">No description</span>`}</span>
          </div>
          ${joinedStatus}
        </div>
        <span style="color:grey;font-size:14px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;display:block;display:flex;gap:5px;align-items:Center;">
            ${formatNumber(cData.posts)} posts •
            by @${escapeHTML(cData.creatorName)} •
            ${formatNumber(cData.membersCount)} members
        </span>
        ${tagsHtml}
      </div>
    `;
    if (!container.querySelector(`#yanto-${cData.id}`)) {
      if (!container.querySelector(".com-item")) container.innerHTML = "";
      container.appendChild(wrapper);
    }
  }
}

async function joinCommunity(communityId) {
  const user = auth.currentUser;
  if (!user) return log("red", "You must be logged in");

  const userRef = doc(db, "users", user.uid);
  const comRef = doc(db, "communities", communityId);
  const banRef = doc(db, "communities", communityId, "bans", user.uid);

  const [userSnap, comSnap, bannedSnap] = await Promise.all([
    getDoc(userRef), 
    getDoc(comRef),
    getDoc(banRef)
  ]);

  if (!comSnap.exists()) return log("red", "Community not found");

  const userData = userSnap.data();
  const comData = comSnap.data();

  if (bannedSnap.exists()) {
    info("x", "Insufficient permission", "You were banned from this community. Please try again later.");
    return;
  }

  if (comData.followersOnly) {
    const snap = await getDoc(doc(db, "users", comData.creatorId, "followers", auth.currentUser.uid));
    if (!snap.exists()) {
      info("i", "No access", "this community requires its members to follow the creator.");
      return;
    }
  }

  if (comData.acceptingApplications) {
    if (localStorage.getItem("disableConfirmation") != "true") {
      const confirmApply = await confirmDialog("request approval?", `This community requires approval to join. Do you want to apply?`);
      if (!confirmApply) return;
    }

    await sendCommunityJoinRequest(comData.creatorId, communityId, comData.name,
      comData.avatar
    );
    return log("green", "Join request sent");
  }

  const memberRef = doc(db, "communities", communityId, "members", user.uid);
  const userRef1 = doc(db, "users", user.uid);

  const status = userData.cannotSeeCom ? 
    "private" : "public";

  await runTransaction(db, async (transaction) => {
    transaction.update(comRef, {
      membersCount: increment(1),
      members: arrayUnion(user.uid)
    });
    transaction.set(memberRef, {
      uid: user.uid,
      joinedAt: new Date(),
      contributions: 1,
      photoURL: userData.photoURL,
      username: userData.username,
      displayName: userData.displayName,
      name: userData.displayName.toLowerCase(),
      description: userData.description || null,
      role: 1,
      status
    });
    transaction.update(userRef1, {
      communitiesCount: increment(1)
    });
  });

  const actionBtn = document.getElementById("communityActionBtn");
  actionBtn.style.background = "rgba(0,0,0,0.8)";
  actionBtn.textContent = "Leave";
  actionBtn.style.color = "white";
  log("green", `You’ve joined ${comData.name}`);
  openCommunity(communityId);
}

window.showCreateCommunityOverlay = showCreateCommunityOverlay;

document.addEventListener("click", async (e) => {
  const comItem = e.target.closest(".com-item");
  if (comItem) {
    if (e.target.closest("#joinBtn") || e.target.closest("[id^='joinBtn_']")) return;

    const comId = comItem.dataset.id;
    if (!comId) return;

    const loadingLabel = comItem.querySelector(`img[src="/image/loader.svg"]`);
    loadingLabel.classList.remove("hidden");

    document.getElementById("memberOverlay").classList.add("hidden");
    document.getElementById("banOverlay").classList.add("hidden");
    await openCommunity(comId);
    loadingLabel.classList.add("hidden");
  }
});

export async function openCommunity(communityId) {
  const user = auth.currentUser;
  window.communityID = communityId;

  if (!user) {
    log("red", "You must be logged in");
    return;
  }

  document.getElementById("skibidicome").classList.add("hidden");

  const comRef  = doc(db, "communities", communityId);
  const memberRef = doc(db, "communities", communityId, "members", user.uid);

  const [comSnap, memberSnap] = await Promise.all([
    getDoc(comRef),
    getDoc(memberRef)
  ]);

  if (!comSnap.exists()) return log("red", "Community not found");
  const cData = comSnap.data();
  window.cData = cData;

  const isJoined = memberSnap.exists();
  const isOwner = cData.creatorId === user.uid;
  const isAdmin = (cData.admin || []).includes(user.uid);
  const canModerate = isOwner || isAdmin;

  if (cData.followersOnly && isJoined && !canModerate) {
    const ref = doc(db, "users", cData.creatorId, "followers", auth.currentUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await runTransaction(db, async (transaction) => {
        transaction.update(comRef, {
          membersCount: increment(-1),
          members: arrayRemove(user.uid)
        });
        transaction.delete(memberRef)
        transaction.update(doc(db, "users", auth.currentUser.uid), {
          communitiesCount: increment(-1)
        });
      });
      document.querySelectorAll(`#myCommunities .com-item[data-id="${communityId}"]`).forEach(el => el.remove());
      info("i", "You unfollowed, you left.", "That's the community's motto. The owner has set only their followers deserve to join this community.")
      return;
    }
  }

  window.canModerate = canModerate;
  window.isOnPrivate = cData.private;
  window.onlyAdmins = cData.onlyAdmins;
  window.isJoined = cData.onlyAdmins && !(isAdmin || isOwner) ? 
    false : isJoined;

  updatePostZIndex();
  updateCbDisplay();

  document.querySelectorAll(".communityo").forEach(o => o.remove());
  const date = cData.createdAt?.toDate ? cData.createdAt.toDate() : new Date(cData.createdAt);
  const formatted = `${date.getDate()} ${date.toLocaleString("default", { month: "short" }).toLowerCase()} ${date.getFullYear()}`;
  const overlay = document.createElement("div");
  overlay.className = "useroverlay communityo";
  overlay.style.pointerEvents = "none";
  window.communityo = overlay; 

  const tagsHtml = (cData.tags || [])
      .map(t => `<span class="tag-badge">${escapeHTML(t)}</span>`)
      .join("");

  const ruleSection = document.getElementById("comRule");
  const ruleContainer = document.getElementById("communityRules");

  if (window.innerWidth > 700) {
    if (cData.rules && Array.isArray(cData.rules) && cData.rules.length > 0) {
      ruleSection.style.display = "block"; 
      ruleContainer.innerHTML = ""; 

      for (let i = 0; i < cData.rules.length; i++) {
        const r = cData.rules[i];
        const div = document.createElement("div");

        const parsedDesc = await parseMentionsToLinks(r.description);

        div.innerHTML = `
          <div class="ruleGroup">
            <div class="ruleNum" style="font-size:22px">${i + 1}.</div>
            <strong class="ruleTitle" style="font-size:20px">${escapeHTML(r.title)}</strong>
          </div>
          <div class="ruleDesc" style="font-size:16px">${parsedDesc}</div>
        `;

        ruleContainer.appendChild(div);
      }

    } else {
      ruleSection.style.display = "none";
    }
  }

  overlay.innerHTML = `
    <div class="user-box" style="height:100dvh !important;width:100%;max-width:539px;pointer-events:auto">
      <header class="flex" style="position:sticky;background:rgba(7, 7, 9, 0.8);
        backdrop-filter:blur(10px);border-bottom:var(--border);
        margin:0 -20px;padding:0 20px;margin-bottom:20px;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;margin:15px 0;">
          <button style="padding:0;padding-right:10px;margin-left:-13px;" onclick="
            history.pushState({}, '', '/');
            document.getElementById('communityActive').style.display = 'none';
            document.getElementById('communityActiveCheckbox').style.display = 'none';
            document.getElementById('communityActiveCheckbox1').style.display = 'none';
          " class="close-btn">
            <img src="/image/leftArrow.svg">
          </button>
          <h2 class="user-link" style="margin:0;">${escapeHTML(cData.name)}</h2>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button onclick="document.getElementById('communitySearch').classList.remove('hidden')" style="background:none;border:none;padding-right:0">
            <img height="20" src="/image/search.svg">
          </button>
          <button onclick="openComMenu('${communityId}', ${isOwner})" style="background:none;border:none;cursor:pointer;">
            <svg style="color:white;" xmlns="http://www.w3.org/2000/svg" width="25" height="25" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 12h.01m6 0h.01m5.99 0h.01"></path>
            </svg>
          </button>
        </div>
      </header>

      <div class="banner-section" style="position:relative;border-radius:10px;background:url('${base91ToImageSrc(cData.banner) || '/image/default-banner.png'}') no-repeat center / cover;" id="com-avatar2">
        <div style="position:relative;height:140px;width:140px;border-radius:20px;background:url('${base91ToImageSrc(cData.avatar) || '/image/default-banner.png'}') no-repeat center / cover;margin-left:20px;border:2px solid black;top:23px;"></div>
        <button id="communityActionBtn" style="
          position:absolute;bottom:10px;right:10px;padding:8px 16px;
          border:none;border-radius:8px;cursor:pointer;
          background:${isOwner ? 'rgba(0,0,0,0.8)' : (isJoined ? 'rgba(0,0,0,0.8)' : 'white')};
          color:${isOwner || isJoined ? 'white' : 'black'};
          font-weight:600;">
          ${isOwner ? 'Disband' : (isJoined ? 'Leave' : 'Join')}
        </button>
      </div>
      
      <div id="hmm">
      <div style="display:flex;gap:15px;margin-top:20px">
        <div style="display:flex;flex-direction:column">
          <h2 style="margin:0" class="skibidi-link" id="com-name2">${escapeHTML(cData.name)}</h2>
          <div style="color:grey;font-size:15px;margin-top:5px;">by @${escapeHTML(cData.creatorName)}</div>
          <div style="color:grey;gap:7px;font-size:15px;display:flex;align-items:center;margin-top:10px;width:100%;">
            <span style="color:var(--color);font-weight:bold;">${formatNumber(cData.posts)}</span> posts
            <img style="height:20px;" src="/image/calendar.svg"> ${escapeHTML(formatted)}
          </div>
        </div>
      </div>
      <div style="margin-bottom:7px;margin-top:15px;font-size:16px;" id="com-desc2">${await parseMentionsToLinks(cData.description) || `<span style="color:grey">No description</span>`} ${window.isOnPrivate === true && window.communityID != null ? `<span style="color:grey;">• private community</span>` : ""}</div>
      ${renderCommunityRequirements(cData)}
      ${tagsHtml}
      <div style="display:flex;align-items:center;gap:10px;margin-top:13px;">
        ${!isJoined && cData.private === true ? "" : `<button class="link" style="text-decoration:underline;font-size:15px;color:var(--color);margin:0;" id="openMembers">members (${cData.membersCount})</button>`}
        ${canModerate ? `<button class="link" style="text-decoration:underline;font-size:15px;color:var(--color);margin:0;" id="openBans">bans</button>` : ""}
        <button class="link" style="text-decoration:underline;font-size:15px;color:var(--color);margin:0;" id="openComArchives">archives</button>
        <button class="link" style="text-decoration:underline;font-size:15px;color:var(--color);margin:0;margin-left:auto;" id="openComRule">rules</button>
      </div>
      </div>
      <div id="appendCommunityTweet"></div>
      <br><br><br><br><br><br>
    </div>
  `;

  overlay.querySelector(".close-btn").addEventListener("click", () => {
    window.communityID = null;
    window.isOnPrivate = false;
    overlay.remove();
    document.getElementById("comRule").style.display = "none";
  });

  const actionBtn = window.communityo.querySelector("#communityActionBtn");
  actionBtn.addEventListener("click", async () => {
  actionBtn.disabled = true;
  actionBtn.classList.add("disabled");
  if (isOwner) {
    const confirmDisband = await confirmDialog("Disband community?", `Are you sure you want to disband "${cData.name}"? This cannot be undone.`, "red");
    if (!confirmDisband) {
      actionBtn.disabled = false;
      actionBtn.classList.remove("disabled");
      return;
    }

    const typed = await inputDialog("Disband community", `Type the exact name to confirm:\n${cData.name}`);
    if (typed !== cData.name) {
      actionBtn.disabled = false;
      actionBtn.classList.remove("disabled");
      log("red", "Name mismatch, cancelled");
      return;
    }
    try {
      const userRef4 = doc(db, "users", auth.currentUser.uid);
      await runTransaction(db, async (tx) => {
        tx.delete(comRef);
        tx.update(userRef4, {
          communitiesCount: increment(-1)
        });
      });
      overlay.remove();
      document.querySelectorAll(`.com-item[data-id="${communityId}"]`).forEach(el => el.remove());
      log("green", "Community disbanded");
      actionBtn.disabled = false;
      actionBtn.classList.remove("disabled");
      document.getElementById("comRule").style.display = "none";
    } catch (err) {
      console.error(err);
      log("red", "Failed to disband");
      actionBtn.disabled = false;
      actionBtn.classList.remove("disabled");
    }
  } else if (isJoined) {
      actionBtn.disabled = true;
      actionBtn.classList.add("disabled");
      const confirmLeave = await confirmDialog("leave community?", `Are you sure you want to leave "${cData.name}"? Once left, you won't be able to join unless you're re-invited.`, "red");
      if (!confirmLeave) {
        actionBtn.disabled = false;
        actionBtn.classList.remove("disabled");
        return;
      }

      const memberRef = doc(db, "communities", communityId, "members", user.uid);
      const userRef2 = doc(db, "users", user.uid);

      try {
        await runTransaction(db, async (transaction) => {
          transaction.update(comRef, {
            membersCount: increment(-1),
            members: arrayRemove(user.uid)
          });
          transaction.delete(memberRef)
          transaction.update(userRef2, {
            communitiesCount: increment(-1)
          });
        });
        overlay.remove();
        document.querySelectorAll(`#myCommunities .com-item[data-id="${communityId}"]`).forEach(el => el.remove());
        log("green", `You left ${cData.name}.`);
        actionBtn.disabled = false;
        actionBtn.classList.remove("disabled");
        loading.classList.remove("show");
      } catch (err) {
        console.error(err);
        log("red", "Failed to leave");
        actionBtn.disabled = false;
        actionBtn.classList.remove("disabled");
        loading.classList.remove("show");
      }
    } else {
      await joinCommunity(communityId);
      actionBtn.disabled = false;
      actionBtn.classList.remove("disabled");
      loadingMyCom = true;
      await loadMyCommunities(true);
      loadingMyCom = false;
      loading.classList.remove("show");
    }
  });

  document.body.appendChild(overlay);

  initArchiveViewer({
      openButton: document.getElementById("openComArchives"), 
      overlay: document.getElementById("communityArchiveOverlay"), 
      listElement: document.getElementById("communityArchiveList"),
      scrollBox: document.querySelector("#communityArchiveOverlay .user-box"),
      searchInput: document.querySelector("#communityArchiveOverlay input"),
      getCollectionRef: () => collection(db, "communities", window.communityID, "posts"),
      emptyMessage: "No archived community posts found"
  });

  if (document.getElementById("openMembers")) {
    document.getElementById("openMembers").addEventListener("click", () => {
      openMembersOverlay(communityId, cData, canModerate);
    });
  }

  const openBans = document.getElementById("openBans");
  if (openBans) {
    openBans.addEventListener("click", () => {
      openBansOverlay(communityId, cData);
    });
  }

  if (window.innerWidth < 700) {
    document.getElementById("openComRule").addEventListener("click", async () => {
      const section = document.getElementById("skibidicome");
      const userbox = document.querySelector("#were");
      const com = cData;

      section.classList.remove("hidden");
      userbox.innerHTML = "";

      if (!com || !Array.isArray(com.rules) || com.rules.length === 0) {
        userbox.innerHTML = `
          <div style="margin-top:60px;width:100%;display:flex;justify-content:center">
            <div style="max-width:400px;text-align:left;">
              <h2 style="margin:0;">There are no rules — yet</h2>
              <p style="color:grey;margin:7px 0;">make one for your community. Rules must comply with <a href="/user/tos" target="_blank">Wyntr terms of service</a></p>
            </div>
          </div>
        `;
        return;
      }

      const ruleDivs = await Promise.all(
        com.rules.map(async (r, i) => {
          const parsedDesc = await parseMentionsToLinks(r.description);
          const div = document.createElement("div");
          div.innerHTML = `
            <div class="ruleGroup">
              <div class="ruleNum">${i + 1}.</div>
              <strong class="ruleTitle">${escapeHTML(r.title)}</strong>
            </div>
            <div class="ruleDesc">${parsedDesc}</div>
          `;
          return div;
        })
      );

      ruleDivs.forEach(div => userbox.appendChild(div));
    });
  } else {
    overlay.querySelector("#openComRule").remove();
  }

  const bruh = cData.private === true && !isJoined;
  if (!bruh) {
    loadCommunityTweets(communityId);
  } else {
    document.getElementById("appendCommunityTweet").innerHTML = `<div style="margin-top:60px;width:100%;display:flex;justify-content:center"><div style="max-width:400px;text-align:left;;"><h2 style="margin:0;">This community is private.</h2><p style="color:grey;margin:7px 0;">you have to join first before seeing posts here</p></div></div>`;
  }

  const communityTweetContainer = document.querySelector(".communityo .user-box");

  if (!bruh) {
    communityTweetContainer.addEventListener("scroll", async () => {
      if (isLoadingCommunityTweets || noMoreCommunityTweets) return;

      const scrollBottom = communityTweetContainer.scrollTop + communityTweetContainer.clientHeight;
      const scrollHeight = communityTweetContainer.scrollHeight;

      if (scrollBottom >= scrollHeight - 200) {
        const communityId = window.communityID;
        if (!communityId) return;

        loadingComList = true;
        await loadCommunityTweets(communityId, true); 
        isLoadingCommunityTweets = false;
      }
    });
  }
}

function renderCommunityRequirements(cData) {
  return `
    <div style="color:grey;font-size:14px;margin-top:10px;margin-bottom:5px">
      ${cData.acceptingApplications ? "<span style='color:#c9a413'>Accepting applications</span>" : ""}
      ${cData.private === false && cData.acceptingApplications === false ? "<span style='color:#04aa6d'>open community</span>" : ""}
      ${cData.followersOnly ? "<span style='color:#c9a413'>• followers only</span>" : ""}
    </div>
  `;
}

let banLastDoc = null;
let banDone = false;
let banLoading = false;
let currentBanCommunity = "";

async function openBansOverlay(communityId, cData) {
  const overlay = document.getElementById("banOverlay");
  const list = document.getElementById("banList");
  const box = overlay.querySelector(".user-box");
  document.querySelector("#banOverlay input").value = ""; 

  overlay.classList.remove("hidden");
  list.innerHTML = "";
  banLastDoc = null;
  banDone = false;
  banLoading = false;
  currentBanCommunity = communityId;
  
  await loadMoreBans(10);

  box.onscroll = () => {
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 10 && !banLoading && !banDone) {
      loadMoreBans(10);
    }
  };
}

function getBanQuery(term, fieldName, limitCount) {
  const constraints = [];
  
  if (term) {
    constraints.push(
      where(fieldName, ">=", term),
      where(fieldName, "<=", term + "\uf8ff"),
      orderBy(fieldName)
    );
  } else {
    constraints.push(orderBy("bannedAt", "desc"));
  }

  if (banLastDoc) constraints.push(startAfter(banLastDoc));
  constraints.push(limit(limitCount));

  return query(collection(db, "communities", currentBanCommunity, "bans"), ...constraints);
}

async function loadMoreBans(limitCount) {
  if (banLoading || banDone) return;
  banLoading = true;

  const list = document.getElementById("banList");
  const term = document.querySelector("#banOverlay input").value.trim().toLowerCase();

  if (!banLastDoc) list.innerHTML = USERS_SKELETON;

  const uniqueDocs = new Map();

  if (term) {
    const [nameSnap, usernameSnap] = await Promise.all([
      getDocs(getBanQuery(term, "name", limitCount)),
      getDocs(getBanQuery(term, "username", limitCount))
    ]);

    nameSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
    usernameSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
  } else {
    const defaultSnap = await getDocs(getBanQuery(null, null, limitCount));
    defaultSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
  }

  if (uniqueDocs.size === 0) {
    banDone = true;
    banLoading = false;
    if (!banLastDoc) {
      list.innerHTML = term 
        ? `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:20px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No banned user found</h2><p style="color:grey;margin:7px 0;">No name or username starts with "${escapeHTML(term)}"</p></div></div>`
        : `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:20px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No banned user</h2><p style="color:grey;margin:7px 0;">Pretty sure members of this community are well-behaved</p></div></div>`;
    }
    return;
  }

  const docArray = Array.from(uniqueDocs.values());
  banLastDoc = docArray[docArray.length - 1];

  if (!list.querySelector(".bans-row")) list.innerHTML = "";

  docArray.forEach(docSnap => {
    const uid = docSnap.id;
    const d = docSnap.data();

    if (list.querySelector(`[data-id="${uid}"]`)) return;

    const row = document.createElement("div");
    row.className = "bans-row member-row";
    row.dataset.id = uid;
    row.innerHTML = `
      <div style="display:flex; gap:12px; width:100%">
        <img loading="lazy" src="${base91ToImageSrc(d.photoURL)}" onerror="this.src='/image/default-avatar.jpg'" style="width:40px; height:40px; border-radius:10px; object-fit:cover; align-self:flex-start;">
        <div style="display:flex;flex-direction:column;gap:6px;width:100%">
          <div style="display:flex;width:100%">
            <div style="display:flex; flex-direction:column; gap:6px">
              <div style="display:flex;align-items:center;gap:6px;">
                <strong style="cursor:pointer;" class="user-link" data-uid="${uid}">${d.displayName ? escapeHTML(d.displayName) : "user"}</strong>
                <span style="color:grey;font-size:14px">${formatDate(d.bannedAt)}</span>
              </div>
              <span style="font-size:14px; color:grey;">@${escapeHTML(d.username)}</span>
            </div>
            <button class="unban-btn">unban</button>
          </div>
          <span style="font-size:14px;overflow-wrap:break-word;overflow-wrap:anywhere;">${d.description ? escapeHTML(d.description.slice(0, 100)) : ""}</span>
        </div>
      </div>`;

    row.addEventListener("click", () => {
      openUserSubProfile(uid);
      closecom();
      window.communityID = null;
      document.querySelector(".communityo")?.remove();
      document.getElementById("communityOverlay").classList.add("hidden");
      document.getElementById("banOverlay").classList.add("hidden");
    });

    row.querySelector(".unban-btn").addEventListener("click", (e) => {
      e.stopPropagation(); 
      unbanMember(currentBanCommunity, uid);
    });

    list.appendChild(row);
  });

  banLoading = false;
}

let lastBanQuery = "";
document.querySelector("#banOverlay input").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;

  const queryUid = e.target.value.trim();
  if (queryUid === lastBanQuery) return;
  lastBanQuery = queryUid;

  document.getElementById("banList").innerHTML = USERS_SKELETON;
  banLastDoc = null;
  banDone = false;
  banLoading = false;

  await loadMoreBans(10);
});

let memberLastDoc = null;
let memberDone = false;
let memberLoading = false;
let currentMemberCommunity = "";
let currentCanModerate = false;
let currentCData = null;
let lastMemberQuery = "";

async function openMembersOverlay(communityId, cData, canModerate) {
  const overlay = document.getElementById("memberOverlay");
  const list = document.getElementById("memberList");
  const box = overlay.querySelector(".user-box");
  document.querySelector("#memberOverlay input").value = "";

  overlay.classList.remove("hidden");
  list.innerHTML = "";
  memberLastDoc = null;
  memberDone = false;
  memberLoading = false;
  
  currentMemberCommunity = communityId;
  currentCanModerate = canModerate;
  currentCData = cData;
  lastMemberQuery = "";

  await loadMoreMembers(10);

  box.onscroll = () => {
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 10 && !memberLoading && !memberDone) {
      loadMoreMembers(10);
    }
  };
}

function getMemberQuery(term, fieldName, limitCount) {
  const constraints = [];

  if (!currentCanModerate) {
    constraints.push(where("status", "!=", "private"));
  }

  if (term) {
    constraints.push(
      where(fieldName, ">=", term),
      where(fieldName, "<=", term + "\uf8ff"),
    );
  } else {
    constraints.push(
      orderBy("role", "desc"),
      orderBy("contributions", "desc")
    );
  }

  if (memberLastDoc) constraints.push(startAfter(memberLastDoc));
  constraints.push(limit(limitCount));

  return query(collection(db, "communities", currentMemberCommunity, "members"), ...constraints);
}

async function loadMoreMembers(limitCount) {
  if (memberLoading || memberDone) return;
  memberLoading = true;

  const list = document.getElementById("memberList");
  const term = document.querySelector("#memberOverlay input").value.trim().toLowerCase();

  if (!memberLastDoc) list.innerHTML = USERS_SKELETON;

  const uniqueDocs = new Map();

  if (term) {
    const [nameSnap, usernameSnap] = await Promise.all([
      getDocs(getMemberQuery(term, "name", limitCount)),
      getDocs(getMemberQuery(term, "username", limitCount))
    ]);

    nameSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
    usernameSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
  } else {
    const defaultSnap = await getDocs(getMemberQuery(null, null, limitCount));
    defaultSnap.forEach(doc => uniqueDocs.set(doc.id, doc));
  }

  if (uniqueDocs.size === 0) {
    memberDone = true;
    memberLoading = false;
    if (!memberLastDoc) {
      list.innerHTML = term
        ? `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:20px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No member found</h2><p style="color:grey;margin:7px 0;">No name or username starts with "${escapeHTML(term)}"</p></div></div>`
        : "";
    }
    return;
  }

  const docArray = Array.from(uniqueDocs.values());
  memberLastDoc = docArray[docArray.length - 1];

  if (!list.querySelector(".user-search-item")) list.innerHTML = "";

  docArray.forEach(docSnap => {
    const d = docSnap.data();
    const uid = docSnap.id;

    if (list.querySelector(`[data-id="${uid}"]`)) return;

    let roleBadge = "";
    if (d.role === 3) roleBadge = `<span style="color:#ff7a18;background:#15181c;padding:2px 6px;border-radius:5px;font-size:13px">creator</span>`;
    else if (d.role === 2) roleBadge = `<span style="color:#f5c451;background:#15181c;padding:2px 6px;border-radius:5px;font-size:13px" class="comRole">admin</span>`;

    const row = document.createElement("div");
    row.className = "user-search-item member-row";
    row.dataset.id = uid;
    row.innerHTML = `
      <div style="display:flex; gap:12px; width:100%">
        <img loading="lazy" src="${base91ToImageSrc(d.photoURL)}" onerror="this.src='/image/default-avatar.jpg'" style="width:40px; height:40px; border-radius:10px; object-fit:cover; align-self:flex-start;">
        <div style="display:flex;flex-direction:column;gap:6px;width:100%">
          <div style="display:flex;width:100%">
            <div style="display:flex; flex-direction:column; gap:6px">
              <div style="display:flex;align-items:center;gap:6px;">
                ${roleBadge}
                <strong style="cursor:pointer;" class="user-link" data-uid="${uid}">${d.displayName ? escapeHTML(d.displayName) : "user"}</strong>
                <span style="color:grey;font-size:14px">${formatDate(d.joinedAt)}</span>
              </div>
              <span style="font-size:14px; color:grey;">@${escapeHTML(d.username)}</span>
            </div>
            ${currentCanModerate ? `<button class="member-dots" style="font-size:20px !important;">⋮</button>` : ""}
            ${uid == auth.currentUser.uid && !currentCanModerate ? `
            <img class="hide-btn" src="/image/eye.svg" style="margin-left:auto; cursor:pointer;height:22px;">`
            : "" }
          </div>
          <span style="font-size:14px;overflow-wrap:break-word;overflow-wrap:anywhere;">${d.description ? escapeHTML(d.description.slice(0, 100)) : ""}</span>
        </div>
      </div>`;

    row.addEventListener("click", () => {
      openUserSubProfile(uid);
      closecom();
      window.communityID = null;
      document.getElementById("communityOverlay").classList.add("hidden");
      document.querySelector(".communityo")?.remove();
      document.getElementById("memberOverlay").classList.add("hidden");
    });

    const hideBtn = row.querySelector(".hide-btn");
    if (hideBtn) {
      hideBtn.addEventListener("click", async (e) => {
        e.stopPropagation();

        const confirmed = await confirmDialog(
          "hide your presence from this community?", 
          "people browsing the member list won't see that you are part of this community. This action is irreversible", 
          "red"
        );
        if (!confirmed) return;

        try {
          const memberDocRef = doc(db, "communities", currentMemberCommunity, "members", auth.currentUser.uid);
          
          loading.classList.add("show");
          await updateDoc(memberDocRef, {
            status: "private"
          });
          loading.classList.remove("show");
          row.remove();
          
          if (!list.querySelector(".user-search-item")) {
            list.innerHTML = ""; 
          }
        } catch (err) {
          console.error("Failed to update community member privacy setting:", err);
        }
      });
    }

    if (currentCanModerate) {
      row.querySelector(".member-dots").addEventListener("click", (e) => {
        e.stopPropagation();
        openMemberMenu({
          communityId: currentMemberCommunity,
          targetUid: uid,
          cData: currentCData
        });
      });
    }

    list.appendChild(row);
  });

  memberLoading = false;
}

document.querySelector("#memberOverlay input").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;

  const queryUid = e.target.value.trim();
  if (queryUid === lastMemberQuery) return;
  lastMemberQuery = queryUid;

  document.getElementById("memberList").innerHTML = USERS_SKELETON;
  memberLastDoc = null;
  memberDone = false;
  memberLoading = false;

  await loadMoreMembers(10);
});

async function openMemberMenu({communityId, targetUid, cData}) {
  loading.classList.add("show");
  const comsnap = await getDoc(doc(db, "communities", communityId, "members", targetUid));
  if (!comsnap.exists()) {
    log("red", "user is no longer member of this community");
    document.querySelector(`.member-row[data-id="${targetUid}"]`).remove();
    loading.classList.remove("show");
    return;
  }

  const overlay = document.getElementById("memberMenuOverlay");

  const kickBtn   = overlay.querySelector(".member-kick");
  const banBtn    = overlay.querySelector(".member-ban");
  const adminBtn  = overlay.querySelector(".member-admin-toggle");
  const resignBtn = overlay.querySelector(".dismiss-admin");

  const close = () => overlay.classList.add("hidden");

  overlay.classList.remove("hidden");

  overlay.querySelector(".close-member-menu").onclick = close;
  overlay.onclick = (e) => e.target === overlay && close();

  kickBtn.style.display   = "none";
  banBtn.style.display    = "none";
  adminBtn.style.display  = "none";
  resignBtn.style.display = "none";

  overlay.querySelector("#member-id").textContent = `User ID: ${targetUid}`;

  const user = auth.currentUser;
  const isCreator = cData.creatorId === user.uid;
  const isAdmin   = (cData.admin || []).includes(user.uid);
  const isTargetCreator = cData.creatorId === targetUid;
  const isTargetAdmin   = (cData.admin || []).includes(targetUid);
  const canKickOrBanTarget = !isTargetCreator && !isTargetAdmin;

  if (isAdmin && targetUid === auth.currentUser.uid) {
    resignBtn.style.display = "flex";

    resignBtn.addEventListener("click", async (e) => {
      e.stopPropagation();

      if (!(await confirmDialog("are you sure?", "You will no longer be an admin in this community unless re-invited by the community owner.", "red"
      ))) return;

      loading.classList.add("show");

      try {
        const comRef = doc(db, "communities", window.communityID);
        const comMemberRef = doc(db, "communities", window.communityID, "members", targetUid);

        await runTransaction(db, async (tx) => {
          tx.update(comRef, {
            admin: arrayRemove(targetUid)
          });
          tx.update(comMemberRef, {
            role: 1
          });
        });

        if (Array.isArray(window.cData?.admin)) {
          window.cData.admin = window.cData.admin.filter(id => id !== targetUid);
        }

        log("green", "You are no longer an admin of this community");

        const { username: name } = await getUserData(targetUid);
        const communityName = await getCommunityNameById(window.communityID);

        sendadminDismissedNotification(cData.creatorId, window.communityID, communityName, name, cData.avatar);
        document.querySelector(`#memberList .member-row[data-id="${targetUid}"] .comRole`).remove();
      } finally {
        loading.classList.remove("show");
        close();
      }
    });
  }

  if ((isCreator || isAdmin) && canKickOrBanTarget) {
    kickBtn.style.display = "flex";
    banBtn.style.display  = "flex";

    kickBtn.onclick = async () => {
      loading.classList.add("show");
      await kickMember(targetUid);
      loading.classList.remove("show");
      close();
    };

    banBtn.onclick = async () => {
      loading.classList.add("show");
      await banMember(targetUid);
      loading.classList.remove("show");
      close();
    };
  }

  if (isCreator && !isTargetCreator) {
    adminBtn.style.display = "flex";
    adminBtn.innerHTML = `
      <img src="/image/pen.svg">
      ${isTargetAdmin ? "Dismiss as admin" : "Make admin"}
    `;

    adminBtn.onclick = async () => {
      loading.classList.add("show");
      await toggleAdmin(targetUid, isTargetAdmin);
      loading.classList.remove("show");
      close();
    };
  }
  loading.classList.remove("show");
}

async function toggleAdmin(uid, isAdmin) {
  if (!Array.isArray(window.cData.admin)) {
    window.cData.admin = [];
  }

  const comRef = doc(db, "communities", window.communityID);
  const memberRef = doc(db, "communities", window.communityID, "members", uid);
  const comSnap = await getDoc(comRef);
  const comData = comSnap.data();

  if (!isAdmin && (comData.admin || []).length >= 10) {
    log("red", "Admin limit reached");
    return;
  }

  if (localStorage.getItem("disableConfirmation") != "true") {
    if (isAdmin) {
      if (!(await confirmDialog("dismiss user as admin?", "are you sure you want to dismiss this user as admin?"))) return;
    } else {
      if (!(await confirmDialog("make user admin?", "are you sure you want to make this user admin? Once proceeded, This user can take dangerous actions to this community.", "red"))) return;
    }
  }

  await runTransaction(db, async (tx) => {
    tx.update(comRef, {
      admin: isAdmin ? arrayRemove(uid) : arrayUnion(uid)
    });
    tx.update(memberRef, {
      role: isAdmin ? 1 : 2
    });
  });

  if (isAdmin) {
    log("green", "successfully dismissed this user as admin");
    window.cData.admin = window.cData.admin.filter(id => id !== uid);
  } else {
    window.cData.admin.push(uid);
    await sendAdminNotification(uid, window.communityID, comData.name, comData.creatorName, comData.creatorId, comData.avatar);
    log("green", "successfully made this user admin");
  }
}

async function unbanMember(communityId, uid) {
  if (!(await confirmDialog("Unban user?", "are you sure you want to unban this user? Once unbanned, user won't be able to be banned again until they re-joined this community.", "red"))) return;
  loading.classList.add("show");

  const comRef = doc(db, "communities", communityId);
  await Promise.all([
    deleteDoc(doc(db, "communities", communityId, "bans", uid)),
  ]);

  loading.classList.remove("show");
  log("green", "Member unbanned");
  document.querySelector(`.bans-row[data-id="${uid}"]`).remove();
}

async function kickMember(uid) {
  if (!(await confirmDialog("Kick user?", "are you sure you want to kick this user? once kicked, user won't be part of this community until they re-joined.", "red"))) return;
  const comId = window.communityID;

  await runTransaction(db, async (tx) => {
    tx.delete(doc(db, "communities", comId, "members", uid));
    tx.update(doc(db, "communities", comId), {
      membersCount: increment(-1),
      members: arrayRemove(uid)
    });
    tx.update(doc(db, "users", uid), {
      communitiesCount: increment(-1)
    });
  });

  document.querySelector(`.member-row[data-id="${uid}"]`).remove();
  log("green", "Member kicked");
}

async function banMember(uid) {
  if (!(await confirmDialog("Ban user?", "are you sure you want to ban this user?", "red"))) return;

  const comId = window.communityID;
  const comRef = doc(db, "communities", comId);
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.data();

  const userRef3 = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    tx.delete(doc(db, "communities", comId, "members", uid));
    tx.update(comRef, {
      membersCount: increment(-1),
      members: arrayRemove(uid),
    });
    tx.set(doc(db, "communities", comId, "bans", uid), {
      uid,
      bannedAt: new Date(),
      photoURL: data.photoURL,
      username: data.username,
      displayName: data.displayName,
      name: data.displayName.toLowerCase(),
      description: data.description || null
    });
    tx.update(userRef3, {
      communitiesCount: increment(-1)
    })
  });

  document.querySelector(`.member-row[data-id="${uid}"]`).remove();
  log("green", "Member banned");
}

window.openComMenu = async function (communityId) {
  const overlay = document.getElementById("comMenuOverlay");
  overlay.classList.remove("hidden");

  const user = auth.currentUser;
  if (!user) return log("red", "You must be logged in");

  const editBtn = overlay.querySelector("#editCom");
  const disbandBtn = overlay.querySelector(".disbandCom");
  const copyBtn = overlay.querySelector(".copy-com-link");
  const closeBtn = overlay.querySelector(".close-com-menu");
  const reportBtn = overlay.querySelector(".reportCom");
  const inviteBtn = overlay.querySelector(".inviteCom");

  inviteBtn.style.display = "none";
  editBtn.style.display = "none";
  disbandBtn.style.display = "none";

  const comRef = doc(db, "communities", communityId);
  const userRef = doc(db, "users", user.uid);

  const [snap, userSnap] = await Promise.all([
    getDoc(comRef),
    getDoc(userRef)
  ]);

  if (!snap.exists()) return log("red", "Community not found");

  const cData = snap.data();
  const userData = userSnap.data();

  const isOwner = cData.creatorId === user.uid;
  const isAdmin  = (cData.admin || []).includes(user.uid);
  const isGlobalAdmin = userData?.role === "admin";

  editBtn.style.display = isOwner || isAdmin ? "flex" : "none";
  inviteBtn.style.display = isOwner || isAdmin ? "flex" : "none";
  reportBtn.style.display = isOwner ? "none" : "flex";
  disbandBtn.style.display = (isGlobalAdmin && cData.creatorId != auth.currentUser.uid) ? "flex" : "none";

  const link = `https://wyntr.netlify.app/community/${communityId}`;
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(link);
      log("green", "Copied community link");
    } catch {
      info("i", "Copy this link", link);
    }
    overlay.classList.add("hidden")
  };

  closeBtn.onclick = () => overlay.classList.add("hidden");

  reportBtn.onclick = async () => {
    const data = snap.data();
    const { username } = await getUserData(data.creatorId);
    const { username: usn } = await getUserData(auth.currentUser.uid);

    const reason = await inputDialog("report community", "state why you're proceeding this action", null, "", true);
    
    discord("community report", "red", {
      "name": data.name,
      "description": data.description,
      "author": `${username} (${data.creatorId})`,
      "total members": data.membersCount,
      "offend": reason,
      "offender": `${usn}, (${auth.currentUser.uid})`,
      "source": link
    }, new Date(), [
      data.avatar || null,
      data.banner || null
    ], "user");

    log("green", "community reported");
    overlay.classList.add("hidden");
  };

  inviteBtn.onclick = async () => {
    const o = document.getElementById("inviteOverlay");
    const list = document.getElementById("inviteList");
    const input = document.querySelector("#inviteOverlay input");
    input.value = "";
  
    const scrollContainer = document.querySelector("#inviteOverlay .user-box") || list;

    o.classList.remove("hidden");

    let lastUsernameDoc = null;
    let lastNameDoc = null;
    let isFetching = false;
    let hasMore = true;
    const LIMIT_PER_PAGE = 10;

    input.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      
      lastUsernameDoc = null;
      lastNameDoc = null;
      hasMore = true;
      list.innerHTML = ""; 
      
      await inviteUsers(input.value);
    });

    scrollContainer.addEventListener("scroll", async () => {
      if (isFetching || !hasMore) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      if (scrollHeight - scrollTop - clientHeight < 20) {
        await inviteUsers(input.value);
      }
    });

    async function inviteUsers(term) {
      if (!term || isFetching || !hasMore) return;
      isFetching = true;

      const lowerTerm = term.toLowerCase();

      const skeleton = document.createElement("div");
      skeleton.className = "scroll-skeleton";
      skeleton.innerHTML = `<div style="margin:0 -20px;margin-top:-15px !important"><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div></div>`;
      list.appendChild(skeleton);

      let uQueryConstraints = [
        collection(db, "users"),
        where("username", ">=", lowerTerm),
        where("username", "<=", lowerTerm + "\uf8ff"),
        limit(LIMIT_PER_PAGE)
      ];

      let nQueryConstraints = [
        collection(db, "users"),
        where("name", ">=", lowerTerm),
        where("name", "<=", lowerTerm + "\uf8ff"),
        limit(LIMIT_PER_PAGE)
      ];

      if (lastUsernameDoc) uQueryConstraints.push(startAfter(lastUsernameDoc));
      if (lastNameDoc) nQueryConstraints.push(startAfter(lastNameDoc));

      try {
        const [usernameSnap, nameSnap] = await Promise.all([
          getDocs(query(...uQueryConstraints)),
          getDocs(query(...nQueryConstraints))
        ]);

        skeleton.remove();

        if (!usernameSnap.empty) {
          lastUsernameDoc = usernameSnap.docs[usernameSnap.docs.length - 1];
        }
        if (!nameSnap.empty) {
          lastNameDoc = nameSnap.docs[nameSnap.docs.length - 1];
        }

        if (usernameSnap.empty && nameSnap.empty) {
          hasMore = false;
          
          if (list.children.length === 0) {
            list.innerHTML = `
              <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
                <div style="max-width:400px;text-align:left;">
                  <h2 style="margin:0;">No Matched users — yet</h2>
                  <p style="color:grey;margin:7px 0;">there's no person that you're looking for.</p>
                </div>
              </div>`;
          }
          isFetching = false;
          return;
        }

        const userMap = new Map();
        usernameSnap.docs.forEach(doc => userMap.set(doc.id, doc));
        nameSnap.docs.forEach(doc => userMap.set(doc.id, doc));

        for (const docSnap of userMap.values()) {
          if (list.querySelector(`#user-${docSnap.id}`)) continue;

          const data = docSnap.data();
          const item = document.createElement("div");
          item.className = "user-search-item";
          item.id = `user-${docSnap.id}`;
          item.style.cssText = "display:flex;gap:10px;padding:15px 0 10px 0;align-items:center";

          item.innerHTML = `
            <div style="display:flex; gap:12px; width:100%">
              <img loading="lazy" src="${base91ToImageSrc(data.photoURL)}" onerror="this.src='/image/default-avatar.jpg'" style="width:40px; height:40px; border-radius:10px; object-fit:cover; align-self:flex-start;">
              <div style="display:flex; flex-direction:column; gap:7px">
                <strong style="cursor:pointer;" class="user-link" data-uid="${docSnap.id}">
                  ${escapeHTML(data.displayName)}
                </strong>
                <span style="font-size:14px; color:grey;">@${escapeHTML(data.username)}</span>
              </div>
              ${docSnap.id === auth.currentUser.uid ? "" : `
                <button class="mini-invite-btn" style="padding:0 10px; border-radius:10px; background:white; cursor:pointer; border:1px solid var(--border); margin-left:auto;height:35px;">Invite</button>  
              `}
            </div>
          `;

          item.addEventListener("click", (e) => {
            if (!e.target.classList.contains("mini-invite-btn")) {
              openUserSubProfile(docSnap.id);
            }
          });

          list.appendChild(item);

          const btn = item.querySelector(".mini-invite-btn");
          if (btn) {
            btn.onclick = async (e) => {
              e.stopPropagation();
              btn.disabled = true;
              btn.classList.add("disabled");

              const followingRef = doc(db, "users", docSnap.id, "following", auth.currentUser.uid);
              const memberRef = doc(db, "communities", window.communityID, "members", docSnap.id);
              const banRef = doc(db, "communities", window.communityID, "bans", docSnap.id);
              const userRef = doc(db, "users", docSnap.id);
              const blockRef = doc(db, "users", docSnap.id, "blocks", auth.currentUser.uid);
              const comRef = doc(db, "communities", window.communityID);

              const [memberSnap, banSnap, followingSnap, userSnap, blockSnap, comSnap] = await Promise.all([
                getDoc(memberRef), getDoc(banRef), getDoc(followingRef), getDoc(userRef), getDoc(blockRef), getDoc(comRef)
              ]);

              let blockData = blockSnap.exists() ? blockSnap.data() : null;
              const userData = userSnap.data();
              const comData = comSnap.data();

              if (memberSnap.exists()) {
                log("red", "this user is already joined");
              } else if (blockSnap.exists() && ((blockData.blockUntil && blockData.blockUntil.toDate() > new Date()) || blockData.permanent === true)) {
                log("red", "user grants no permission");
              } else if (banSnap.exists()) {
                log("red", "this user is banned from the community");
              } else {
                if (!userData.invitePermission || userData.invitePermission === "everyone") {
                  await sendInviteNotification(docSnap.id, window.communityID, comData.name, comData.avatar);
                  log("green", "user invited");
                } else if (userData.invitePermission === "follow") {
                  if (!followingSnap.exists()) {
                    log("red", "user grants no permission");
                  } else {
                    await sendInviteNotification(docSnap.id, window.communityID, comData.name, comData.avatar);
                    log("green", "user invited");
                  }
                } else if (userData.invitePermission === "no") {
                  log("red", "user grants no permission");
                }
              }

              btn.disabled = false;
              btn.classList.remove("disabled");
            };
          }
        }
      } catch (err) {
        console.error("Pagination error: ", err);
      } finally {
        isFetching = false;
      }
    }

    overlay.classList.add("hidden");
  };

  editBtn.onclick = async () => {
    overlay.classList.add("hidden");
    if (!isOwner && !isAdmin) return log("red", "Insufficient permission");

    const old = document.getElementById("createCommunity");
    if (old) old.remove();

    editingId = communityId;

    const user = auth.currentUser;
    if (!user) return log("red", "You must be logged in");

    const snap = await getDoc(comRef);
    if (!snap.exists()) return log("red", "Community not found");
    const cData = snap.data();

    await showCreateCommunityOverlay(communityId);

    document.getElementById("communityNameInput").value = cData.name || "";
    document.getElementById("communityDescInput").value = cData.description || "";

    const bannerPreview = document.getElementById("com-banner-preview");
    bannerPreview.style.background = `url('${base91ToImageSrc(cData.banner) || "/image/default-banner.png"}') no-repeat center / cover`;

    const avaPreview = document.getElementById("com-ava-preview");
    avaPreview.style.background = `url('${base91ToImageSrc(cData.avatar) || "/image/default-avatar.jpg"}') no-repeat center / cover`;

    document.getElementById("acceptApplicationCheck").checked = !!cData.acceptingApplications;
    document.getElementById("privateCheck").checked = !!cData.private;
    document.getElementById("onlyAdmins").checked = !!cData.onlyAdmins;

    document.getElementById("followersonly")?.remove();

    selectedTags = [...(cData.tags || [])];
    refreshTagUI();
    const existingRules = cData.rules || [];

    document.getElementById("addRuleBtn").onclick = () => addRuleRow();

    existingRules.forEach(r => {
      addRuleRow(r.title, r.description);
    });

    document.getElementById("createCom").textContent = "Edit Community";
    const createBtn = document.getElementById("createCommunityBtn");
    createBtn.textContent = "Save Changes";
  };

  disbandBtn.onclick = async () => {
    if (!isGlobalAdmin) return log("red", "Insufficient permission");
    const confirmDelete = await confirmDialog("Disband community?", "Are you sure you want to disband this community permanently?", "red");
    if (!confirmDelete) return;

    const typed = await inputDialog("Disband community", `Type the community name EXACTLY to confirm:\n${cData.name}`, null, "", true);
    if (typed !== cData.name) {
      log("red", "Name mismatch, cancelled");
      return;
    }

    const reason = await inputDialog("disband community", "state why you're proceeding this action", null, "", true);
    loading.classList.add("show");

    const { username: offenderName } = await getUserData(auth.currentUser.uid);
    const { username: creatorName } = await getUserData(cData.creatorId);

    const susRef = doc(db, "susList", cData.creatorId);
    const susSnap = await getDoc(susRef);
    const currentWarnings = susSnap.exists() ? susSnap.data().warnings || 0 : 0;

    discord("community deleted", "red", {
      "name": cData.name,
      "description": cData.description,
      "author": `${creatorName} (${cData.creatorId})`,
      "total members": cData.membersCount,
      "offend": reason,
      "offender": `${offenderName} (${auth.currentUser.uid})`,
      "user warnings": `${currentWarnings + 1}`,
    }, new Date(), [
      cData.avatar || null,
      cData.banner || null
    ], "admin");

    await deleteDoc(comRef);
    sendCommunityWarningNotification(cData.creatorId, cData.name, reason, cData.avatar);
    
    updateDoc(susRef, {
      warnings: increment(1)
    }, { merge: true });

    loading.classList.remove("show");
    log("green", "Community has been disbanded");
    overlay.classList.add("hidden");
    document.querySelector(".communityo")?.remove();
    document.getElementById("communityActiveCheckbox").style.display = "none";
    document.getElementById("communityActiveCheckbox1").style.display = "none";
    document.querySelectorAll(`.com-item[data-id="${communityId}"]`).forEach(el => el.remove());
    document.getElementById("comRule").style.display = "none";
  };
};

async function waitForAuth() {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user || null);
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  document.addEventListener("DOMContentLoaded", init);
  init();
}

async function init() {
  document.getElementById("comsvg").addEventListener("click", async () => {
    document.querySelector(`.tab5[data-target="myCommunities"]`).click();
  });
  const user = await waitForAuth();
  if (!user) return info("x", "Unauthorized", "user is not logged in");
  const path = window.location.pathname;
  const comMatch = path.match(/^\/community\/([^/]+)$/);
  if (comMatch) {
    const communityId = comMatch[1];
    loading.classList.add("show");
    const snap = await getDoc(doc(db, "communities", communityId));
    const data = snap.data();

    if (data.private === true) {
      loading.classList.remove("show");
      const memberSnap = await getDoc(doc(db, "communities", communityId, "members", user.uid));
      if (!memberSnap.exists()) {
        info("x", "No access", "This community is a private community and you don't have permission to view this community.");
        return;
      }
    }
    loading.classList.remove("show");
    await openCommunity(communityId);
  }
}

document.getElementById("searchMyCom")?.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;  
    const term = e.target.value.trim().toLowerCase();

    const list = document.getElementById("myCommunities");
    list.innerHTML = COMMUNITIES_SKELETON;

    if (!term) {
      loadingComList = true;
      await loadMyCommunities(true);
      loadingComList = false;
      return;
    }

    const q = query(
      collection(db, "communities"),
      where("lowerCase", ">=", term),
      where("lowerCase", "<=", term + "\uf8ff"),
      where("members", "array-contains", auth.currentUser.uid),
      orderBy("lowerCase"),
      limit(7)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:20px;">
          <div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No communities found</h2><p style="color:grey;margin:7px 0;">Try a different name.</p></div>
        </div>`;
      return;
    }

    if (!list.querySelector(".com-item")) {
      list.innerHTML = "";
    }

    for (const docSnap of snap.docs) {
      const c = docSnap.data();

      const wrapper = document.createElement("div");
      wrapper.className = "com-item";
      wrapper.dataset.id = c.id;

      const tagsHtml = (c.tags || [])
      .map(t => `<span class="tag-badge">${escapeHTML(t)}</span>`)
      .join("");

      wrapper.innerHTML = `
        <div>
          <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:5px;">
            <div id="com-avatar" style="min-height:43px;min-width:43px;border-radius:10px;background:url('${base91ToImageSrc(c.avatar)}') no-repeat center / cover"></div>
            <div style="display:flex;flex-direction:column;max-width:300px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
              <strong style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;margin-bottom:3px" id="com-name">${escapeHTML(c.name)}</strong>
              <span id="com-desc" style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
                ${escapeHTML(c.description) || "No description"}
              </span>
            </div>
            <img src="/image/loader.svg" height="20" style="margin-left:auto" class="hidden">
          </div>
          <span style="color:grey;font-size:14px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;display:block;display:flex;gap:5px;align-items:Center;">
            ${formatNumber(c.posts)} posts •
            by @${escapeHTML(c.creatorName)} •
            ${formatNumber(c.membersCount)} members
            ${c.private ? "• private" : ""}
          </span>
          ${tagsHtml}
        </div>
      `;

      list.appendChild(wrapper);
    }
});

document.getElementById("searchCom")?.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;  
    const term = e.target.value.trim().toLowerCase();

    const list = document.getElementById("communityList");
    list.innerHTML = COMMUNITIES_SKELETON;

    if (!term) {
      loadingComList = true;
      await loadCommunities(true);
      loadingComList = false;
      return;
    }

    const q = query(
      collection(db, "communities"),
      where("private", "!=", true),
      where("lowerCase", ">=", term),
      where("lowerCase", "<=", term + "\uf8ff"),
      orderBy("lowerCase"),
      limit(7)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:20px;">
          <div style="max-width:400px;text-align:left;">
            <h2 style="margin:0;">No communities found</h2>
            <p style="color:grey;margin:7px 0;">Try a different name.</p>
          </div>
        </div>`;
      return;
    }

    if (!list.querySelector(".com-item")) {
      list.innerHTML = "";
    }

    for (const docSnap of snap.docs) {
      const c = docSnap.data();

      const wrapper = document.createElement("div");
      wrapper.className = "com-item";
      wrapper.dataset.id = c.id;

      const joined = (c.members || []).includes(auth.currentUser.uid);

      const tagsHtml = (c.tags || [])
      .map(t => `<span class="tag-badge">${escapeHTML(t)}</span>`)
      .join("");

      wrapper.innerHTML = `
        <div>
          <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:5px;">
            <div style="min-height:43px;min-width:43px;border-radius:10px;background:url('${base91ToImageSrc(c.avatar)}') no-repeat center / cover"></div>
            <div style="display:flex;flex-direction:column;max-width:300px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
              <strong>${escapeHTML(c.name)}</strong>
              <span style="color:grey;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${escapeHTML(c.description) || "No description"}
              </span>
            </div>
            ${joined ? `
              <div style="margin-left:auto;display:flex;align-items:Center;gap:5px;">
                <div style="color:grey;font-size:14px;">Joined</div>
                <img src="/image/loader.svg" height="20" class="hidden">
              </div>
              ` : `
              <img style="margin-left:auto" src="/image/loader.svg" height="20" class="hidden">
              `}
          </div>
          <span style="color:grey;font-size:14px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;display:block;display:flex;gap:5px;align-items:Center;">
            ${formatNumber(c.posts)} posts •
            by @${escapeHTML(c.creatorName)} •
            ${formatNumber(c.membersCount)} members
          </span>
          ${tagsHtml}
        </div>
      `;

      list.appendChild(wrapper);
    }
});

async function loadCommunityTweets(communityId, loadMore = false) {
  const container = document.getElementById("appendCommunityTweet");
  const user = auth.currentUser;

  if (!loadMore) {
    container.innerHTML = `<div id="communityloadingbitches">${TWEETS_SKELETON}</div>`;
    lastVisibleCommunityTweet = null;
    noMoreCommunityTweets = false;

    if (window.cData?.pinned && window.cData.pinned !== "") {
      const pinnedId = window.cData.pinned;

      try {
        const pinnedRef = doc(db, "communities", communityId, "posts", pinnedId);
        const pinnedSnap = await getDoc(pinnedRef);

        if (pinnedSnap.exists() && pinnedSnap.data().archived == false) {
          const label = document.createElement("div");
          label.className = "pinned-label";
          label.innerHTML = `
            <div class="iq pinlabel communityPinned-${pinnedId}" style="background:var(--color);margin-top:40px;width:fit-content;font-size:13px;margin-left:-5px;">Pinned by community admins</div>
          `;

          if (!container.querySelector(".tweet") && !container.querySelector(".pinned-label") && container.querySelector("#communityloadingbitches")) container.querySelector("#communityloadingbitches").remove();
          if (container.querySelector("#communitynobitches")) container.querySelector("#communitynobitches").remove();

          container.appendChild(label);

          await renderTweet(pinnedSnap.data(), pinnedId, user, "append", container, communityId);
        }
      } catch (err) {
        console.error("Failed to load pinned post:", err);
      }
    } else {
      if (document.querySelector(".pinned-label")) document.querySelector(".pinned-label").remove();
    }
  }

  if (noMoreCommunityTweets) return;

  const baseRef = collection(db, "communities", communityId, "posts");
  let q;

  if (loadMore && lastVisibleCommunityTweet) {
    q = query(
      baseRef,
      orderBy("createdAt", "desc"),
      where("archived", "!=", true),
      startAfter(lastVisibleCommunityTweet),
      limit(3)
    );
  } else {
    q = query(
      baseRef,
      orderBy("createdAt", "desc"),
      where("archived", "!=", true),
      limit(3)
    );
  }

  const snap = await getDocs(q);
  if (snap.empty) {
    if (!container.querySelector(".tweet")) {
     container.innerHTML = `
          <div id="communitynobitches" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:60px;">
            <div style="max-width:400px;text-align:left;margin:0 10px;">
              <h2 style="margin:0;">No Wynts — yet</h2>
              <p style="color:grey;margin:7px 0;">Be the first one to post something in this community.</p>
            </div>
          </div>
    `;
    }
    noMoreCommunityTweets = true;
    return;
  }

  lastVisibleCommunityTweet = snap.docs[snap.docs.length - 1];

  snap.docs.forEach(async (docSnap) => {
    const id = docSnap.id;

    if (window.cData?.pinned && window.cData.pinned === id) return;
    if (!container.querySelector(".tweet") && !container.querySelector(".pinned-label") && container.querySelector("#communityloadingbitches")) container.querySelector("#communityloadingbitches").remove();
    if (container.querySelector("#communitynobitches")) container.querySelector("#communitynobitches").remove();

    await renderTweet(docSnap.data(), id, user, "append", container, communityId);
  });
}

document.body.addEventListener("click", async (e) => { 
  const communityLink = e.target.closest(".communityLink");
  if (communityLink) {
    const id = communityLink.dataset.id;
    openCommunity(id);
    if (communityLink.dataset.tweet) {
      const tweetViewer = document.getElementById("tweetViewer");
      const box = tweetViewer.querySelector("#appendTweet");

      tweetViewer.classList.remove("hidden");
      document.body.classList.add("no-scroll");

      const tweetRef = doc(db, "communities", id, "posts", communityLink.dataset.tweet);
      const tweetSnap = await getDoc(tweetRef);

      if (!tweetSnap.exists()) {
        loading.classList.remove("show");
        document.getElementById("commentList").innerHTML = "";
        box.innerHTML = `
          <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
            <div style="max-width:400px;text-align:left;">
              <h2 style="margin:0;">No Wynt found</h2>
              <p style="color:grey;margin:7px 0;">seems like this Wynt have been deleted.</p>
            </div>
          </div>`;
        return;
      }

      const tweetData = tweetSnap.data();
      loading.classList.remove("show");
      window.communityID = id;
      renderTweetViewer(tweetData, communityLink.dataset.tweet, box, auth.currentUser, id);
      loadComments(communityLink.dataset.tweet, true, null, null, id);
      openCommunity(id);
    }
  }
});

const communityScrollBox = document.querySelector("#communityOverlay .user-box");

communityScrollBox?.addEventListener("scroll", async () => {
    const nearBottom =
      communityScrollBox.scrollTop + communityScrollBox.clientHeight >=
      communityScrollBox.scrollHeight - 150;

    if (!nearBottom) return;

    const isMy = document.querySelector('.tab5[data-target="myCommunities"].active');
    const isList = document.querySelector('.tab5[data-target="communityList"].active');

    if (isMy) {
        if (loadingMyCom) return;
        loadingMyCom = true;
        await loadMyCommunities();      
        loadingMyCom = false;
        return;
    }
    if (isList) {
        if (loadingComList || !hasMoreCommunities) return;

        loadingComList = true;
        await loadCommunities();      
        loadingComList = false;
        return;
    }
});

const searchInput = document.querySelector("#communitySearch input");
const tweetsView = document.getElementById("wyntsView");
const TWEETS_PAGE = 7;

let previousTerm = "";
let lastTweetDoc = null;

searchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    const term = searchInput.value.trim();   
    if (term === previousTerm) return;
    previousTerm = term;
    if (term) {
      if (window.isOnPrivate && !window.isJoined) {
        info("x", "insufficient permission", "This is a private community and you're not joined.");
        return;
      }
      const tweets = await searchTweets(term, true);
      tweetsView.innerHTML = "";

      if (tweets.length === 0) {
        tweetsView.innerHTML = `
          <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
            <div style="max-width:400px;text-align:left;">
              <h2 style="margin:0;">No Wynts matched — yet</h2>
              <p style="color:grey;margin:7px 0;">when someone posts topic you're looking for, it will appear here.</p>
            </div>
          </div>`;
        return;
      }
      tweets.forEach(t => renderTweet(t, t.id, auth.currentUser, "append", tweetsView, window.communityID));
    } else {
      tweetsView.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
          <div style="max-width:400px;text-align:left;">
            <h2 style="margin:0;display:flex;gap:10px;">
              <img loading='lazy' height="33" style="transform:rotate(90deg)" src="/image/search.svg"> Search for Wynts
            </h2>
            <p style="color:grey;margin:7px 0;">enter at least 3 characters to search Wynts.</p>
          </div>
        </div>`;
    }
  }
});

async function searchTweets(term, reset = true) {
  const words = tokenize(term);
  if (words.length === 0) return [];

  const searchList = words.slice(0, 10);

  if (reset) lastTweetDoc = null;

  const base = [
    where("searchTokens", "array-contains-any", searchList),
    where("archived", "!=", true),
    orderBy("createdAt", "desc"),
    limit(TWEETS_PAGE),
  ];

  const q = lastTweetDoc ?
    query(collection(db, "communities", window.communityID, "posts"), ...base, startAfter(lastTweetDoc)) :
    query(collection(db, "communities", window.communityID, "posts"), ...base);

  const snap = await getDocs(q);

  const mustHaveAll = true;
  const results = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();
    if (
      !mustHaveAll ||
      words.every(w => (d.searchTokens || []).includes(w))
    ) {
      results.push({
        id: docSnap.id,
        ...d
      });
    }
  });

  if (!snap.empty) {
    lastTweetDoc = snap.docs[snap.docs.length - 1];
  }
  return results;
}

let comLastDoc = null;
let loadingUserCom = false;

document.getElementById("my-com").onclick = () => {
  openCommunityOverlay(auth.currentUser.uid, true);
  comLastDoc = null;
  window.cannotSeeCom = false;
  window.currentComID = auth.currentUser.uid;
};

document.getElementById("com").onclick = () => {
  openCommunityOverlay(document.getElementById("user-name").dataset.uid, true);
  comLastDoc = null;
  window.cannotSeeCom = false;
  window.currentComID = document.getElementById("user-name").dataset.uid;
};

async function openCommunityOverlay(uid, reset) {
  document.getElementById("profileCom").classList.remove("hidden");
  const container = document.getElementById("profileComList");

  if (reset) {
    comLastDoc = null;
    container.innerHTML = COMMUNITIES_SKELETON;

    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();

    if (userData.cannotSeeCom && uid != auth.currentUser.uid) {
      container.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
          <div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No permission</h2><p style="color:grey;margin:7px 0;">This user chose to not show their communities publicly.</p></div>
        </div>
      `;
      window.cannotSeeCom = true;
      return;
    }
  }

  let q;

  if (!comLastDoc) {
    q = query(
      collection(db, "communities"),
      where("private", "!=", true),
      where("members", "array-contains", uid),
      limit(10)
    );
  } else {
    q = query(
      collection(db, "communities"),
      where("private", "!=", true),
      where("members", "array-contains", uid),
      startAfter(comLastDoc),
      limit(10)
    );
  }

  const snap = await getDocs(q);

  if (snap.empty && !comLastDoc) {
    container.innerHTML = `
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No communities joined — yet</h2><p style="color:grey;margin:7px 0;">looks like this user is not joined in any community.</p></div></div>
    `;
    return;
  }

  comLastDoc = snap.docs[snap.docs.length - 1];

  for (const docSnap of snap.docs) {
    const id = docSnap.id;
    const cData = docSnap.data();

    const div = document.createElement("div");
    div.className = "com-item communityLink";
    div.dataset.id = id;
    div.id = `community-${id}`;
    const joined = (cData.members || []).includes(auth.currentUser.uid);

    let joinedStatus = joined && uid != auth.currentUser.uid ? `
      <div style="margin-left:auto;display:flex;align-items:center;gap:5px;">
        <div style="color:grey;font-size:14px;">Joined</div>
        <img src="/image/loader.svg" height="20" class="hidden">
      </div>
    ` : `
    <img style="margin-left:auto" src="/image/loader.svg" height="20" class="hidden">
    `;

    const tagsHtml = (cData.tags || [])
      .map(t => `<span class="tag-badge">${escapeHTML(t)}</span>`)
      .join("");

    div.innerHTML = `
      <div>
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:9px;">
          <div id="com-avatar" style="min-height:47px;min-width:47px;max-height:43px;max-width:45px;margin-top:4px;border-radius:10px;background:url('${base91ToImageSrc(cData.avatar) || "/image/default.png"}') no-repeat center / cover">
          </div>
          <div style="display:flex;gap:3px;flex-direction:column;max-width:300px;overflow:hidden;">
            <strong style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;margin-bottom:3px">
              ${escapeHTML(cData.name)}
            </strong>
            <span style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
              ${escapeHTML(cData.description) || `<span style="color:grey">No description</span>`}
            </span>
          </div>
          ${joinedStatus}
        </div>

        <span style="color:grey;font-size:14px;display:flex;gap:5px;">
          ${formatNumber(cData.posts)} posts •
          by @${escapeHTML(cData.creatorName)} •
          ${formatNumber(cData.membersCount)} members
          ${cData.private ? `• private` : ""}
        </span>

        ${tagsHtml}
      </div>
    `;

    if (!container.querySelector(`#community-${id}`)) {
      if (!container.querySelector(".com-item")) container.innerHTML = "";
      container.appendChild(div);
    }
  }
}

const sb = document.querySelector("#profileCom .user-box");
sb?.addEventListener("scroll", async () => {
  const nearBottom =
    sb.scrollTop + sb.clientHeight >= sb.scrollHeight - 150;

  if (!nearBottom) return;
  if (loadingUserCom) return;
  if (!comLastDoc) return; 

  loadingUserCom = true;
  await openCommunityOverlay(window.currentComID, false);
  loadingUserCom = false;
});

document.querySelector("#profileCom input")?.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;  
    const term = e.target.value.trim().toLowerCase();

    const list = document.getElementById("profileComList");

    if (window.cannotSeeCom) {
      list.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
          <div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No permission</h2><p style="color:grey;margin:7px 0;">This user chose to not show their communities publicly.</p></div>
        </div>
      `;
      return;
    }

    list.innerHTML = COMMUNITIES_SKELETON;

    if (!term) {
      loadingUserCom = true;
      await openCommunityOverlay(window.currentComID, true);
      loadingUserCom = false;
      return;
    }

    const q = query(
      collection(db, "communities"),
      where("private", "!=", true),
      where("lowerCase", ">=", term),
      where("lowerCase", "<=", term + "\uf8ff"),
      where("members", "array-contains", window.currentComID),
      orderBy("lowerCase"),
      limit(7)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:20px;">
          <div style="max-width:400px;text-align:left;">
            <h2 style="margin:0;">No communities found</h2>
            <p style="color:grey;margin:7px 0;">Try a different name.</p>
          </div>
        </div>`;
      return;
    }

    if (!list.querySelector(".com-item")) {
      list.innerHTML = "";
    }

    for (const docSnap of snap.docs) {
      const cData = docSnap.data();

      const wrapper = document.createElement("div");
      wrapper.className = "com-item communityLink";
      wrapper.dataset.id = cData.id;

      const joined = (cData.members || []).includes(auth.currentUser.uid);

      let joinedStatus = joined ? `
        <div style="margin-left:auto;display:flex;align-items:center;gap:5px;">
          <div style="color:grey;font-size:14px;">Joined</div>
          <img src="/image/loader.svg" height="20" class="hidden">
        </div>
      ` : `
      <img style="margin-left:auto" src="/image/loader.svg" height="20" class="hidden">
      `;

      const tagsHtml = (cData.tags || [])
        .map(t => `<span class="tag-badge">${escapeHTML(t)}</span>`)
        .join("");

      wrapper.innerHTML = `
        <div>
          <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:9px;">
            <div id="com-avatar" style="min-height:47px;min-width:47px;max-height:43px;max-width:45px;margin-top:4px;border-radius:10px;background:url('${base91ToImageSrc(cData.avatar) || "/image/default.png"}') no-repeat center / cover">
            </div>
            <div style="display:flex;gap:3px;flex-direction:column;max-width:300px;overflow:hidden;">
              <strong style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;margin-bottom:3px">
                ${escapeHTML(cData.name)}
              </strong>
              <span style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
                ${escapeHTML(cData.description) || `<span style="color:grey">No description</span>`}
              </span>
            </div>
            ${joinedStatus}
          </div>

          <span style="color:grey;font-size:14px;display:flex;gap:5px;">
            ${formatNumber(cData.posts)} posts •
            by @${escapeHTML(cData.creatorName)} •
            ${formatNumber(cData.membersCount)} members
            ${cData.private ? `• private` : ""}
          </span>

          ${tagsHtml}
        </div>
      `;

      list.appendChild(wrapper);
    }
});

const communityNameCache = new Map();

export async function getCommunityNameById(communityId) {
  if (!communityId) return "unknown";
  if (communityNameCache.has(communityId)) {
    return communityNameCache.get(communityId);
  }
  try {
    const comRef = doc(db, "communities", communityId);
    const comSnap = await getDoc(comRef);
    let name = "unknown";
    if (comSnap.exists()) {
      name = comSnap.data().name || "unknown";
    }
    communityNameCache.set(communityId, name);
    return name;
  } catch (err) {
    console.error("Error fetching community name:", err);
    return "unknown";
  }
}