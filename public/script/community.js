import { auth, db, doc, getDoc, updateDoc, collection, setDoc, arrayUnion, increment, addDoc, getDocs, query, orderBy, limit, arrayRemove, deleteDoc, where, startAfter } from "./firebase.js";
import { fileToBase64 } from "./settings.js";
import { sendCommunityJoinRequest, sendCommunityWarningNotification, sendAdminNotification } from "./notification.js";
import { renderTweet, openReportOverlay, getUserData } from "./index.js";
import { askDeleteReason } from "./moderation.js";
import { sendToDiscord } from "./discord.js";
import { tokenize, escapeHTML, formatDate, formatNumber, parseMentionsToLinks, info, log, inputDialog, confirmDialog } from "./texts.js";
import { quickImageNSFWCheck, logNSFWResult, dataUrlToBase91, base91ToImageSrc } from "./attachments.js";
import { openUserSubProfile } from "./user.js";

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
let memberLastDoc             = null;
let memberLoading             = false;
let memberDone                = false;
let currentMemberCommunity    = null;
let banLastDoc                = null;
let banLoading                = false;
let banDone                   = false;
let currentBanCommunity       = null;
let memberQuery               = "";
let banQuery                  = "";

window.communityID            = null;
window.isOnPrivate            = false;

const searchcom               = document.getElementById("searchCom");
const createbtn               = document.querySelector(".create-community-btn");
const loading                 = document.getElementById("loadingOverlay");

import { communityfilled, communitysvg, searchsvg, searchfilled, homefilled, homesvg, community } from "./nonsense.js";

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
    <input class="rule-title" placeholder="Rule title" value="${escapeHTML(title)}" />
    <textarea class="rule-desc" placeholder="Rule description">${escapeHTML(description)}</textarea>
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

  document.getElementById("rulesList").appendChild(ruleDiv);
}

function rebuildIndexes() {
  const newRules = [];

  document.querySelectorAll(".rule-item").forEach((item, i) => {
    item.dataset.index = i;

    const title = item.querySelector(".rule-title").value;
    const description = item.querySelector(".rule-desc").value;

    newRules.push({ title, description });
  });

  rules = newRules;
}

document.getElementById("comsvg").addEventListener("click", () => {
  loadingMyCom = true;
  loadMyCommunities();
  loadingMyCom = false;
  document.getElementById("myCommunities").classList.remove("hidden");
  document.querySelector(`.tab5[data-target="communityList"]`).classList.remove("active");
  document.querySelector(`.tab5[data-target="myCommunities"]`).classList.add("active");
  searchcom.classList.add("hidden");
  createbtn.classList.remove("hidden");
});

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
      createbtn.classList.add("hidden");
    } else if (tabTarget == "myCommunities") {
      loadingMyCom = true;
      loadMyCommunities();
      loadingMyCom = false;
      searchcom.classList.add("hidden");
      createbtn.classList.remove("hidden");
    }

  });
});

let myComOffset = 0;

export function bumpCommunityOrder(comId) {
  let order = JSON.parse(localStorage.getItem("communityOrder")) || [];
  order = [comId, ...order.filter(id => id !== comId)];
  localStorage.setItem("communityOrder", JSON.stringify(order));
}

export async function loadMyCommunities(reset = false) {
  const container = document.getElementById("myCommunities");

  if (reset) {
    myComOffset = 0;
    container.innerHTML = `
            <div class="skeleton-skibidi">
              <div class="skeleton-card" style="width:100%;margin:30px -15px;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div></div></div><div class="skeleton-line medium" style="margin-top:-15px"></div></div>
            </div>
            <div class="skeleton-skibidi">
              <div class="skeleton-card" style="width:100%;margin:30px -15px;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div></div></div><div class="skeleton-line medium" style="margin-top:-15px"></div></div>
            </div>
            <div class="skeleton-skibidi">
              <div class="skeleton-card" style="width:100%;margin:30px -15px;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div></div></div><div class="skeleton-line medium" style="margin-top:-15px"></div></div>
            </div>
    `;
  }

  const user = auth.currentUser;
  if (!user) return log("red", "user isn't logged in");

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.data();
  const communityIds = userData?.communities || [];

  if (communityIds.length === 0) {
    container.innerHTML = `
          <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
            <div style="max-width:400px;text-align:left;">
              <h2 style="margin:0;">No communities joined — yet</h2>
              <p style="color:grey;margin:7px 0;">looks like you're not joined to any community. Discover it and start your journey.</p>
            </div>
          </div>
    `;
    return;
  }

  let order = JSON.parse(localStorage.getItem("communityOrder")) || [];
  order = order.filter(id => communityIds.includes(id));
  localStorage.setItem("communityOrder", JSON.stringify(order));
  const leftover = communityIds.filter(id => !order.includes(id));
  let leftoverMeta = [];

  for (const id of leftover) {
    const ref = doc(db, "communities", id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      leftoverMeta.push({ id, ...snap.data() });
    }
  }

  leftoverMeta.sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));
  const finalIDs = [...order, ...leftoverMeta.map(x => x.id)];
  const perPage = 10;
  const slice = finalIDs.slice(myComOffset, myComOffset + perPage);

  for (const id of slice) {
    const ref = doc(db, "communities", id);
    const snap = await getDoc(ref);

    if (!snap.exists()) continue;

    const cData = snap.data();

    const div = document.createElement("div");
    div.className = "com-item";
    div.dataset.id = id;
    div.id = `community-${id}`;

    const tagsHtml = (cData.tags || [])
      .map(t => `<span class="tag-badge">${escapeHTML(t)}</span>`)
      .join("");

    div.innerHTML = `
      <div>
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:5px;">
          <div id="com-avatar" style="min-height:43px;min-width:43px;max-height:43px;max-width:45px;margin-top:4px;border-radius:5px;background:url('${
            base91ToImageSrc(cData.avatar) || "/image/default.png"
          }') no-repeat center / cover"></div>
          <div style="display:flex;gap:3px;flex-direction:column;max-width:300px;overflow:hidden;">
            <strong style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;" id="com-name">${escapeHTML(cData.name)}</strong>
            <span id="com-desc" style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
              ${escapeHTML(cData.description) || `<span style="color:grey">No description</span>`}
            </span>
          </div>
        </div>
        <span style="color:grey;font-size:14px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;display:block;display:flex;gap:5px;align-items:Center;">
            ${formatNumber(cData.posts)} posts •
            by ${escapeHTML(cData.creatorName)} •
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

  myComOffset += perPage;
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

  overlay.innerHTML = `
    <div class="user-box" style="width:100%;max-width:519px;pointer-events:auto;">
      <header class="flex" style="position:absolute;top:20px;left:0;right:0;margin:0">
        <button onclick="document.getElementById('createCommunity').classList.add('hidden')" class="close-btn">
          <img src="/image/x.svg" alt="Close">
        </button>
      </header>
      <div class="banner-preview1" style="z-index:1;">
        <div id="com-banner-preview"></div>
        <div class="group">
          <label class="button" id="com-banner-label" for="com-banner-input"><img src="/image/upload.svg"></label>
        </div>
      </div>
      <div class="ava-preview1">
        <div id="com-ava-preview"></div>
        <label class="button" id="com-ava-label" for="com-ava-input"><img src="/image/upload.svg"></label>
      </div>
      <br>
      <h2 id="createCom">Create a Community</h2>

      <div class="container1">
        <span>Name</span>
        <input id="communityNameInput" type="text" placeholder="i just lost my dawg" style="border:none;padding:0;">
      </div>

      <div class="container1">
        <span>Description</span>
        <input id="communityDescInput" type="text" placeholder="a community on wyntr" style="border:none;padding:0;">
      </div>
      
      <p>Requirements</p>
      <p style="color:grey;font-size:15px;">Requirements users must have to join this community</a></p>

      <div class="container1">
        <div style="display:flex;align-items:center;gap:5px;margin:5px 0;">
          <span>Only people who follows you</span>
          <div class="switch-row" style="margin-left:auto">
            <input id="onlyFollowers" type="checkbox">
            <label for="onlyFollowers" class="switch-label" aria-hidden="true">
              <span class="switch-track">
                <span class="switch-knob" aria-hidden="true"></span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div class="container1">
        <div style="display:flex;align-items:center;gap:9px;margin:5px 0;">
          <input id="minFollowersInput" type="number" placeholder="no" style="border:none;padding:0;margin:0;width:60px;background:var(--light);border-radius:5px;padding:3px;">
          <span>Minimum Followers</span>
        </div>
      </div>

      <div class="container1">
        <div style="display:flex;align-items:center;gap:9px;margin:5px 0;">
          <input id="minWSInput" type="number" placeholder="no" style="border:none;padding:0;margin:0;width:60px;background:var(--light);border-radius:5px;padding:3px;">
          <span>Minimum Wyntr score</span>
        </div>
      </div>

      <div class="container1">
        <div style="display:flex;align-items:center;gap:9px;margin:5px 0;">
          <input id="joinFeeInput" type="number" placeholder="no" style="border:none;padding:0;margin:0;width:60px;background:var(--light);border-radius:5px;padding:3px;">
          <span>joining Fee (maximum 500)</span>
        </div>
      </div>

      <div id="comTags">
        <p>Select up to 3 tags</p>
        <p style="color:grey;font-size:15px;">Choose topics your community is made for</a></p>

        <div class="container1" style="margin-top:10px;">
          <div id="communityTagOptions">
            ${["tech","gaming","entertainment","lifestyle","art","science","social","finance","hobbies"]
              .map(t => `
              <div class="tagBox" data-tag="${t}" style="
                padding:5px 12px;border-radius:8px;cursor:pointer;
                border:1px solid transparent;font-size:15px;">
                ${t}
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <p>Community mode</p>
      <p style="color:grey;font-size:15px;">Choose whether your community is not discoverable or requires approval to join</a></p>

      <div class="container1">
        <div style="display:flex;align-items:center;gap:5px;margin:5px 0;">
          <span>Accepting applications</span>
          <div class="switch-row" style="margin-left:auto">
            <input id="acceptApplicationCheck" type="checkbox">
            <label for="acceptApplicationCheck" class="switch-label" aria-hidden="true">
              <span class="switch-track">
                <span class="switch-knob" aria-hidden="true"></span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div class="container1">
        <div style="display:flex;align-items:center;gap:5px;margin:5px 0;">
          <span>Private community</span>
          <div class="switch-row" style="margin-left:auto">
            <input id="privateCheck" type="checkbox">
            <label for="privateCheck" class="switch-label" aria-hidden="true">
              <span class="switch-track">
                <span class="switch-knob" aria-hidden="true"></span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div id="rulesSection">
        <p style="margin-top:15px;">community Rules</p>
        <p style="color:grey;font-size:15px;">These rules must comply with the <a href="/user/tos" target="_blank">Wyntr terms of service</a></p>

        <div id="rulesList" style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">
        </div>

        <button id="addRuleBtn" class="link" style="margin-top:10px;">+ Add Rule</button>
      </div>
          
      <div style="display:flex;gap:5px;align-items:Center">
          <button id="createCommunityBtn" style="padding:10px 25px;border-radius:10px;margin-top:5px;">Create for 300 Wcoins</button>
          <button id="cancelCreateCommunityBtn" style="background:none;color:var(--color);border:none;">Cancel</button>
      </div>

      <input type="file" id="com-banner-input" class="hidden-input" accept="image/*">
      <input type="file" id="com-ava-input" class="hidden-input" accept="image/*">
    <br><br><br><br><br><br>
    </div>
  `;
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
    if (result.isNSFW) {
      log("red", "image contains NSFW");
      loading.classList.remove("show");
      return;
    }
    const base64 = await fileToBase64(file);
    bannerPreview.style.background = `url("${escapeHTML(base64)}") no-repeat center / cover`;
    bannerPreview.dataset.image = base64;
  });

  avaInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const result = await quickImageNSFWCheck(file);
    logNSFWResult("image", result);
    if (result.isNSFW) {
      log("red", "image contains NSFW");
      loading.classList.remove("show");
      return;
    }
    const base64 = await fileToBase64(file);
    avaPreview.style.background = `url("${escapeHTML(base64)}") no-repeat center / cover`;
      avaPreview.dataset.image = base64;
  });

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

  const getValidNum = (id, max = Infinity) => {
    const val = parseFloat(document.getElementById(id).value);
    if (isNaN(val) || val <= 0) return null;
    return Math.min(Math.round(val), max);
  };

document.getElementById("createCommunityBtn").onclick = async () => {
  const user     = auth.currentUser          ;
  const userRef  = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef)     ;
  const userData = userSnap.data()           ;
  const balance  = userData?.balance || 0    ;

  if (balance < 300) return log("red", "Not enough Wcoins (need 300)");

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

  const reqs = {
    minFollowers: getValidNum("minFollowersInput"),
    minWS: getValidNum("minWSInput"),
    joinFee: getValidNum("joinFeeInput", 500),
    mustFollow: document.getElementById("onlyFollowers").checked,
  };

  const banner = document.getElementById("com-banner-preview").dataset.image || "/image/default-banner.png";
  const avatar = document.getElementById("com-ava-preview").dataset.image    || "/image/default-avatar.jpg";

  const displayName = userData?.username || "Unknown";

  const communityRef = doc(collection(db, "communities"));
  const acceptingApplications = document.getElementById("acceptApplicationCheck")?.checked || false;
  const private1 = document.getElementById("privateCheck")?.checked || false;

  if (!(await confirmDialog("Create community?", "A non-refundable 300 Wcoins from your balance will be deducted"))) {
    btn.disabled = false;
    btn.classList.remove("disabled");
    return;
  }

  await setDoc(communityRef, {
    id:           communityRef.id      ,
    name:         comName              ,
    lowerCase:    comName.toLowerCase(),
    description:  desc                 ,
    creatorId:    user.uid             ,
    creatorName:  displayName          ,
    createdAt:    Date.now()           ,
    banner                             ,
    avatar                             ,
    requirements: reqs                 ,
    posts:        0                    ,
    membersCount: 1                    ,
    acceptingApplications              ,
    private: private1,
    tags: selectedTags,
    rules: rules,
  });

  const memberRef = doc(db, "communities", communityRef.id, "members", user.uid);

  await setDoc(memberRef, {
    uid: user.uid,
    joinedAt: new Date(),
    photoURL: userData.photoURL,
    username: userData.username
  });

  await updateDoc(userRef, {
    balance:     increment(-300)           ,
    communities: arrayUnion(communityRef.id),
  });
  
    log("green", "Community created successfully");
    loading.classList.remove("show");
    overlay.remove();
    btn.disabled = false;
    btn.classList.remove("disabled");
    bumpCommunityOrder(communityRef.id);
    loadingMyCom = true;
    loadMyCommunities(true);
    loadingMyCom = false;
  } else {
    const reqs = {
      minFollowers: getValidNum("minFollowersInput") ,
      minWS: getValidNum("minWSInput")        ,
      joinFee: getValidNum("joinFeeInput", 500) ,
      mustFollow: document.getElementById("onlyFollowers").checked,
    };

    const comRef  = doc(db, "communities", editingId);
    const comSnap = await getDoc(comRef)             ;

    if (!comSnap.exists()) {
      log("Red", "Community not found");
      btn.disabled = false;
      btn.classList.remove("disabled");
      return;
    }

    const cData         = comSnap.data()                               ;
    const bannerPreview = document.getElementById("com-banner-preview");
    const avaPreview    = document.getElementById("com-ava-preview")   ;

    const bannerImage = bannerPreview.dataset.image
      ? await dataUrlToBase91(bannerPreview.dataset.image)
      : cData.banner;

    const avatarImage = avaPreview.dataset.image
      ? await dataUrlToBase91(avaPreview.dataset.image)
      : cData.avatar;

    await updateDoc(comRef, {
      name:                  comName,
      lowerCase:             lowerName,
      description:           desc,
      banner:                bannerImage,
      avatar:                avatarImage,
      acceptingApplications: document.getElementById("acceptApplicationCheck").checked,
      private:               document.getElementById("privateCheck").checked,
      tags:                  selectedTags,
      requirements:          reqs,
      rules:                 rules,
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
    container.innerHTML = `
            <div class="skeleton-skibidi">
              <div class="skeleton-card" style="width:100%;margin:30px -15px;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div></div></div><div class="skeleton-line medium" style="margin-top:-15px"></div></div>
            </div>
            <div class="skeleton-skibidi">
              <div class="skeleton-card" style="width:100%;margin:30px -15px;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div></div></div><div class="skeleton-line medium" style="margin-top:-15px"></div></div>
            </div>
            <div class="skeleton-skibidi">
              <div class="skeleton-card" style="width:100%;margin:30px -15px;"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div></div></div><div class="skeleton-line medium" style="margin-top:-15px"></div></div>
            </div>
    `  ;
    lastCommunityDoc    = null;
    hasMoreCommunities  = true;
  }

  if (!hasMoreCommunities) return;

  const user = auth.currentUser;
  if (!user) return;

  const userRef         = doc(db, "users", user.uid) ;
  const userSnap        = await getDoc(userRef)      ;
  const userData        = userSnap.data()            ;
  const userCommunities = userData?.communities || [];

  let queryRef = collection(db, "communities");
  let q = lastCommunityDoc
    ? query(queryRef, orderBy("membersCount", "desc"), startAfter(lastCommunityDoc), limit(10))
    : query(queryRef, orderBy("membersCount", "desc"), limit(10));

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    if (container.innerHTML === "") container.innerHTML = "<p>No communities found</p>";
    hasMoreCommunities = false;
    return;
  }

  lastCommunityDoc = snapshot.docs[snapshot.docs.length - 1];

  for (const comm of snapshot.docs) {
    const cData  = comm.data()                       ;
    if (cData.private === true) continue;
    const joined = userCommunities.includes(cData.id);

    let joinedStatus = joined
      ? `<div style="color:grey;font-size:15px;margin-left:auto;">Joined</div>`
      : "";

    const wrapper      = document.createElement("div");
    wrapper.className  = "com-item";
    wrapper.dataset.id = cData.id;
    wrapper.id = `yanto-${cData.id}`;

    const tagsHtml = (cData.tags || [])
      .map(t => `<span class="tag-badge">${escapeHTML(t)}</span>`)
      .join("");

    wrapper.innerHTML  = `
      <div>
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:5px;">
          <div style="min-height:43px;min-width:43px;max-height:43px;max-width:45px;margin-top:4px;border-radius:5px;background:url('${base91ToImageSrc(cData.avatar) || '/image/default.png'}') no-repeat center / cover" id="com-avatar1"></div>
          <div style="display:flex;gap:3px;flex-direction:column;max-width:300px;overflow:hidden;">
            <strong id="com-name1">${escapeHTML(cData.name)}</strong>
            <span style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;" id="com-desc1">${escapeHTML(cData.description) || `<span style="color:grey">No description</span>`}</span>
          </div>
          ${joinedStatus}
        </div>
        <span style="color:grey;font-size:14px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;display:block;display:flex;gap:5px;align-items:Center;">
            ${formatNumber(cData.posts)} posts •
            by ${escapeHTML(cData.creatorName)} •
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

  const [userSnap, comSnap] = await Promise.all([getDoc(userRef), getDoc(comRef)]);
  if (!comSnap.exists()) return log("red", "Community not found");

  const userData = userSnap.data();
  const comData = comSnap.data();
  const bannedSnap = await getDoc(doc(db, "communities", communityId, "bans", user.uid));

  if (bannedSnap.exists()) {
    info("x", "Insufficient permission", "You were banned from this community. Please try again later.");
    return;
  }
  const req = comData.requirements || {}; 

  const followingRef = doc(db, "users", user.uid, "following", comData.creatorId);
  const followingSnap = await getDoc(followingRef);

  const balance = userData.balance || 0;
  const followers = userData.followers || 0;
  const posts = userData.posts || 0;
  const IQ = userData.IQ || 0;

  const reasons = [];

  if (req.minFollowers && followers < req.minFollowers) {
    reasons.push(`You need at least ${req.minFollowers} followers.`);
  }
  if (req.minWS && IQ < req.minWS) {
    reasons.push(`You need at least ${req.minWS} WS.`);
  }
  if (req.joinFee && balance < req.joinFee) {
    reasons.push(`You need at least ${req.joinFee} Wcoins.`);
  }
  if (req.mustFollow === true && !followingSnap.exists()) {
    reasons.push(`You must be following ${comData.creatorName} to join.`);
  }
  if (reasons.length > 0) {
    info("x", "Insufficient permission", reasons.join(" "));
    return;
  }

  if (comData.acceptingApplications) {
    const confirmApply = await confirmDialog("request approval?", `This community requires approval to join. Do you want to apply${req.joinFee ? ` and pay ${req.joinFee} Wcoins` : ""}?`);
    if (!confirmApply) return;

    if (req.joinFee && req.joinFee > 0) {
      await updateDoc(userRef, { balance: increment(-req.joinFee) });
    }

    await sendCommunityJoinRequest(comData.creatorId, communityId, comData.name, req.joinFee || 0);
    return log("green", "Join request sent");
  }

  if (req.joinFee && req.joinFee > 0) {
    const confirmJoin = await confirmDialog("pay to join?", `Are you sure you want to join "${comData.name}" for ${req.joinFee} Wcoins? Once paid, Fee will not be refundable`);
    if (!confirmJoin) return;

    const creatorRef = doc(db, "users", comData.creatorId);
    const creatorReward = Math.floor(req.joinFee * 0.8);

    await Promise.all([
      updateDoc(userRef, { balance: increment(-req.joinFee) }),
      updateDoc(creatorRef, { balance: increment(creatorReward) })
    ]);
  }

  const memberRef = doc(db, "communities", communityId, "members", user.uid);
  const currentInterest = userData.interest || [];

  const counts = {};
  currentInterest.forEach(tag => {
    counts[tag] = (counts[tag] || 0) + 1;
  });

  const normalizedInterest = [];
  Object.entries(counts).forEach(([tag, count]) => {
    const finalCount = count >= 30 ? 15 : count;
    for (let i = 0; i < finalCount; i++) {
      normalizedInterest.push(tag);
    }
  });

  const updatedInterest = normalizedInterest.concat(comData.tags || []);

  await Promise.all([
    updateDoc(userRef, { 
      communities: arrayUnion(communityId),
      interest: updatedInterest
    }),
    updateDoc(comRef, {
      membersCount: increment(1),
    }),
    setDoc(memberRef, {
      uid: user.uid,
      joinedAt: new Date(),
      photoURL: userData.photoURL,
      username: userData.username
    })
  ]);

  const actionBtn = document.getElementById("communityActionBtn");
  actionBtn.style.background = "rgba(0,0,0,0.8)";
  actionBtn.textContent = "Leave";
  actionBtn.style.color = "white";
  log("green", `You’ve joined ${comData.name}`);
  bumpCommunityOrder(communityId);
}

window.showCreateCommunityOverlay = showCreateCommunityOverlay;

document.addEventListener("click", async (e) => {
  const comItem = e.target.closest(".com-item");
  if (comItem) {
    if (e.target.closest("#joinBtn") || e.target.closest("[id^='joinBtn_']")) return;

    const comId = comItem.dataset.id;
    if (!comId) return;

    document.getElementById("memberOverlay").classList.add("hidden");
    document.getElementById("banOverlay").classList.add("hidden");
    openCommunity(comId);
  }
});

export async function openCommunity(communityId) {
  const user = auth.currentUser;

  if (!user) {
    log("red", "You must be logged in");
    return;
  }

  const comRef  = doc(db, "communities", communityId);
  document.getElementById("skibidicome").classList.add("hidden");

  const comSnap = await getDoc(comRef);
  if (!comSnap.exists()) return log("red", "Community not found");

  const cData = comSnap.data();
  window.cData = cData;

  const memberRef = doc(db, "communities", communityId, "members", user.uid);
  const memberSnap = await getDoc(memberRef);
  const isJoined = memberSnap.exists();

  if (isJoined) { 
    window.communityID = communityId;
    if (cData.private === true) {
      window.isOnPrivate = true;
    }
  }
  const isOwner = cData.creatorId === user.uid;
  const isAdmin = (cData.admin || []).includes(user.uid);
  const canModerate = isOwner || isAdmin;
  window.canModerate = canModerate;

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
            <strong class="ruleTitle" style="font-size:22px">${escapeHTML(r.title)}</strong>
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
    <div class="user-box" style="width:100%;max-width:519px;pointer-events:auto">
      <header class="flex" style="position:sticky;background:rgba(7, 7, 9, 0.9);
        backdrop-filter:blur(10px);border-bottom:var(--border);
        margin:0 -20px;padding:0 20px;margin-bottom:20px;align-items:center;justify-content:space-between;">
        <h2 style="display:flex;align-items:center;margin:15px 0;">
          <button style="padding:0;padding-right:10px;margin-left:-13px;" onclick="history.pushState({}, '', '/');" class="close-btn">
            <img src="/image/leftArrow.svg">
          </button>
          Community
        </h2>
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

      <div class="banner-section" style="position:relative;height:120px;border-radius:10px;background:url('${base91ToImageSrc(cData.banner) || '/image/default-banner.png'}') no-repeat center / cover;" id="com-avatar2">
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
          <div style="color:grey;font-size:15px;margin-top:5px;">by ${escapeHTML(cData.creatorName)}</div>
          <div style="color:grey;gap:5px;font-size:15px;display:flex;align-items:center;margin-top:10px;width:100%;">
            <img src="/image/write-gray.svg" style="height:20px;"> ${formatNumber(cData.posts)}
            <img style="height:20px;" src="/image/calendar.svg"> ${escapeHTML(formatted)}
            <img src="/image/community-gray.svg" style="height:20px;">${formatNumber(cData.membersCount) || 0}
          </div>
        </div>
      </div>
      <div style="margin-bottom:7px;margin-top:15px;font-size:16px;" id="com-desc2">${await parseMentionsToLinks(cData.description) || `<span style="color:grey">No description</span>`} ${window.isOnPrivate === true && window.communityID != null ? `<span style="color:grey;">• private community</span>` : ""}</div>
      ${renderCommunityRequirements(cData)}
      ${tagsHtml}
      <div style="display:flex;align-items:center;gap:10px;margin-top:13px;">
        ${!isJoined && cData.private === true ? "" : `<button class="link" style="text-decoration:underline;font-size:15px;color:var(--color);margin:0;" id="openMembers">members</button>`}
        ${canModerate ? `<button class="link" style="text-decoration:underline;font-size:15px;color:var(--color);margin:0;" id="openBans">bans</button>` : ""}
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
      const members = cData.members || [];
      const removeFromMembers = members.map(uid => {
        const uRef = doc(db, "users", uid);
        return updateDoc(uRef, {
          communities: arrayRemove(communityId)
        });
      });

      const deleteCommunity = deleteDoc(comRef);
      await Promise.all([...removeFromMembers, deleteCommunity]);
      overlay.remove();
      document.querySelectorAll(`.com-item[data-id="${communityId}"]`).forEach(el => el.remove());
      log("green", "Community disbanded");
      actionBtn.disabled = false;
      actionBtn.classList.remove("disabled");

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
      const userRef = doc(db, "users", user.uid);

      try {
        await Promise.all([
          updateDoc(userRef, { 
            communities: arrayRemove(communityId) 
          }),
          updateDoc(comRef, {
            membersCount: increment(-1)
          }),
          deleteDoc(memberRef)
        ]);
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

  const bruh = cData.private === true && !isJoined;
  if (!bruh) {
    loadCommunityTweets(communityId);
  } else {
    document.getElementById("appendCommunityTweet").innerHTML = `
<div style="margin-top:60px;width:100%;display:flex;justify-content:center"><div style="max-width:400px;text-align:left;;"><h2 style="margin:0;">This community is private.</h2><p style="color:grey;margin:7px 0;">you have to join first before seeing posts here</p></div></div>
    `;
  }
  const communityTweetContainer = document.querySelector(".communityo .user-box");

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

function renderCommunityRequirements(cData) {
  const req = cData.requirements || {};
  const hasReqs =
    req.joinFee != null ||
    req.minFollowers != null ||
    req.minWS != null ||
    req.mustFollow === true;

  return `
    <div style="color:grey;font-size:14px;margin-top:10px;margin-bottom:5px">
      ${cData.acceptingApplications ? "<span style='color:#c9a413'>Accepting applications</span><br>" : ""}
      ${cData.acceptingApplications === false && hasReqs ? "<span style='color:var(--color)'>Requirements</span><br>" : ""}
      ${
        hasReqs
          ? `
            ${req.joinFee != null ? `- ${escapeHTML(req.joinFee)} Wcoins join fee<br>` : ""}
            ${req.minFollowers != null ? `- ${req.escapeHTML(minFollowers)} followers minimum<br>` : ""}
            ${req.minWS != null ? `- ${escapeHTML(req.minWS)} Wyntr score minimum<br>` : ""}
            ${req.mustFollow != false ? `- must follow ${escapeHTML(cData.creatorName)}<br>` : ""}
          `
          : ""
      }
      ${req.joinFee == null && req.minFollowers == null && req.minWS == null && req.mustFollow === false && cData.private === false && cData.acceptingApplications === false ? "<span style='color:#04aa6d'>open community</span>" : ""}
    </div>
  `;
}

async function openBansOverlay(communityId, cData) {
  const overlay = document.getElementById("banOverlay");
  const list = document.getElementById("banList");
  const box = overlay.querySelector(".user-box");

  overlay.classList.remove("hidden");
  list.innerHTML = "";
  banLastDoc = null;
  banDone = false;
  banLoading = false;
  currentBanCommunity = communityId;
  await loadMoreBans(10);

  box.onscroll = () => {
    if (
      box.scrollTop + box.clientHeight >= box.scrollHeight - 10 &&
      !banLoading &&
      !banDone
    ) {
      loadMoreBans(10);
    }
  };
}

async function loadMoreBans(limitCount) {
  if (banLoading || banDone) return;
  banLoading = true;

  const list = document.getElementById("banList");

  let q = query(
    collection(db, "communities", currentBanCommunity, "bans"),
    orderBy("bannedAt", "desc"),
    limit(limitCount)
  );

  if (banLastDoc) {
    q = query(
      collection(db, "communities", currentBanCommunity, "bans"),
      orderBy("bannedAt", "desc"),
      startAfter(banLastDoc),
      limit(limitCount)
    );
  }

  const snap = await getDocs(q);

  if (snap.empty) {
    banDone = true;
    banLoading = false;
    list.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:20px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No banned user</h2><p style="color:grey;margin:7px 0;">Pretty sure members of this community are well-behaved</p></div></div>`;
    return;
  }

  banLastDoc = snap.docs[snap.docs.length - 1];

  snap.forEach(docSnap => {
    const uid = docSnap.id;
    const d = docSnap.data();

    if (list.querySelector(`[data-id="${uid}"]`)) return;

    const row = document.createElement("div");
    row.className = "bans-row member-row";
    row.dataset.id = uid;

    row.innerHTML = `
      <img loading='lazy' src="${base91ToImageSrc(d.photoURL)}" onerror="this.src='/image/default-avatar.jpg'"
           style="width:40px;height:40px;border-radius:10px;object-fit:cover;align-self:flex-start;">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px;">
          <strong style="cursor:pointer;" class="user-link">${escapeHTML(d.username)}</strong>
          <span style="color:grey;font-size:14px">${formatDate(d.bannedAt)}</span>
          <button class="unban-btn">unban</button>
        </div>
        <span style="font-size:15px;color:grey">${escapeHTML(uid)}</span>
      </div>
    `;

    row.addEventListener("click", () => {
      openUserSubProfile(uid);
      closecom();
      document.querySelector(".communityo")?.remove();
      document.getElementById("communityOverlay").classList.add("hidden");
      document.getElementById("banOverlay").classList.add("hidden");
    });

    const dots = row.querySelector(".unban-btn");
    dots.addEventListener("click", (e) => {
    e.stopPropagation(); 
      unbanMember(currentBanCommunity, uid);
    });

    list.appendChild(row);
  });

  banLoading = false;
}

document.getElementById("banSearch").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;

  const queryUid = e.target.value.trim();
  const list = document.getElementById("banList");
  
  if (queryUid === banQuery) return;
  banQuery = queryUid;

  if (!queryUid) {
    list.innerHTML = "";

    banLastDoc = null;
    banDone = false;
    banLoading = false;

    await loadMoreBans(10);
    return;
  }
  list.innerHTML = "";
  banDone = true;
  banLoading = true;

  const ref = doc(
    db,
    "communities",
    currentBanCommunity,
    "bans",
    queryUid
  );

  const snap = await getDoc(ref);
  const d = snap.data();

  if (!snap.exists()) {
    list.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:20px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No banned user found</h2><p style="color:grey;margin:7px 0;">Make sure you're typing the correct user ID (case sensitive)</p></div></div>`;
    banLoading = false;
    return;
  }

  const row = document.createElement("div");
  row.className = "bans-row member-row";
  row.dataset.id = queryUid;

  row.innerHTML = `
      <img loading='lazy' src="${base91ToImageSrc(d.photoURL)}" onerror="this.src='/image/default-avatar.jpg'"
           style="width:40px;height:40px;border-radius:10px;object-fit:cover;align-self:flex-start;">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px;">
          <strong style="cursor:pointer;" class="user-link">${escapeHTML(d.username)}</strong>
          <span style="color:grey;font-size:14px">${formatDate(d.bannedAt)}</span>
          <button class="unban-btn">unban</button>
        </div>
        <span style="font-size:15px;color:grey">${escapeHTML(queryUid)}</span>
      </div>
  `;

  row.addEventListener("click", () => {
    openUserSubProfile(queryUid);
    closecom();
    document.getElementById("communityOverlay").classList.add("hidden");
    document.querySelector(".communityo")?.remove();
    document.getElementById("banOverlay").classList.add("hidden");
  });

  const dots = row.querySelector(".unban-btn");
  dots.addEventListener("click", (e) => {
  e.stopPropagation(); 
    unbanMember(currentBanCommunity, queryUid);
  });

  list.appendChild(row);
  banLoading = false;
});

async function renderAdminsFirst(cData, canModerate) {
  const list = document.getElementById("memberList");
  const admins = cData.admin || [];

  for (const uid of admins) {
    if (uid === cData.creatorId) continue;
    if (list.querySelector(`[data-id="${uid}"]`)) continue;

    const snap = await getDoc(
      doc(db, "communities", currentMemberCommunity, "members", uid)
    );
    if (!snap.exists()) continue;

    const d = snap.data();

    const row = document.createElement("div");
    row.className = "user-search-item member-row admin-row";
    row.dataset.id = uid;

    row.innerHTML = `
      <img loading='lazy' src="${base91ToImageSrc(d.photoURL)}" onerror="this.src='/image/default-avatar.jpg'"
           style="width:40px;height:40px;border-radius:10px;object-fit:cover;align-self:flex-start;">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="color:#f5c451;background:#15181c;padding:2px 6px;border-radius:5px;font-size:13px">admin</span>
          <strong style="cursor:pointer;" class="user-link">${escapeHTML(d.username)}</strong>
          <span style="color:grey;font-size:14px">${formatDate(d.joinedAt)}</span>
          ${canModerate ? `<button class="member-dots" style="font-size:20px !important;">⋮</button>` : ""}
        </div>
        <span style="font-size:15px;color:grey">${escapeHTML(uid)}</span>
      </div>
    `;

    row.addEventListener("click", () => {
      openUserSubProfile(uid);
      closecom();
      document.getElementById("communityOverlay").classList.add("hidden");
      document.querySelector(".communityo")?.remove();
      document.getElementById("memberOverlay").classList.add("hidden");
    });

    if (canModerate) {
      const dots = row.querySelector(".member-dots");
      dots.addEventListener("click", (e) => {
        e.stopPropagation(); 
        openMemberMenu({
          communityId: currentMemberCommunity,
          targetUid: uid,
          cData
        });
      });
    }

    list.appendChild(row);
  }
}

async function renderOwnerFirst(cData, canModerate) {
  const list = document.getElementById("memberList");
  const ownerUid = cData.creatorId;

  if (!ownerUid) return;
  if (list.querySelector(`[data-id="${ownerUid}"]`)) return;

  const snap = await getDoc(
    doc(db, "communities", currentMemberCommunity, "members", ownerUid)
  );
  if (!snap.exists()) return;

  const d = snap.data();

  const row = document.createElement("div");
  row.className = "user-search-item member-row owner-row";
  row.dataset.id = ownerUid;

  row.innerHTML = `
      <img loading='lazy' src="${base91ToImageSrc(d.photoURL)}" onerror="this.src='/image/default-avatar.jpg'"
           style="width:40px;height:40px;border-radius:10px;object-fit:cover;align-self:flex-start;">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="color:#ff7a18;background:#15181c;padding:2px 6px;border-radius:5px;font-size:13px">creator</span>
          <strong style="cursor:pointer;" class="user-link">${escapeHTML(d.username)}</strong>
          <span style="color:grey;font-size:14px">${formatDate(d.joinedAt)}</span>
          ${canModerate ? `<button class="member-dots" style="font-size:20px !important;">⋮</button>` : ""}
        </div>
        <span style="font-size:15px;color:grey">${escapeHTML(ownerUid)}</span>
      </div>
  `;

  row.addEventListener("click", () => {
    openUserSubProfile(ownerUid);
    closecom();
    document.getElementById("communityOverlay").classList.add("hidden");
    document.querySelector(".communityo")?.remove();
    document.getElementById("memberOverlay").classList.add("hidden");
  });

  if (canModerate) {
    const dots = row.querySelector(".member-dots");
    dots.addEventListener("click", (e) => {
    e.stopPropagation(); 
      openMemberMenu({
        communityId: currentMemberCommunity,
        targetUid: ownerUid,
        cData
      });
    });
  }

  list.appendChild(row);
}

async function openMembersOverlay(communityId, cData, canModerate) {
  const overlay = document.getElementById("memberOverlay");
  const list = document.getElementById("memberList");
  const box = overlay.querySelector(".user-box");

  overlay.classList.remove("hidden");
  list.innerHTML = "";
  memberLastDoc = null;
  memberDone = false;
  memberLoading = false;
  currentMemberCommunity = communityId;

  await renderOwnerFirst(cData, canModerate);
  await renderAdminsFirst(cData, canModerate);
  await loadMoreMembers(10, cData, canModerate);

  box.onscroll = () => {
    if (
      box.scrollTop + box.clientHeight >= box.scrollHeight - 10 &&
      !memberLoading &&
      !memberDone
    ) {
      loadMoreMembers(10, cData, canModerate);
    }
  };
}

async function loadMoreMembers(limitCount, cData, canModerate) {
  if (memberLoading || memberDone) return;
  memberLoading = true;

  const list = document.getElementById("memberList");

  let q = query(
    collection(db, "communities", currentMemberCommunity, "members"),
    orderBy("joinedAt", "desc"),
    limit(limitCount)
  );

  if (memberLastDoc) {
    q = query(
      collection(db, "communities", currentMemberCommunity, "members"),
      orderBy("joinedAt", "desc"),
      startAfter(memberLastDoc),
      limit(limitCount)
    );
  }

  const snap = await getDocs(q);

  if (snap.empty) {
    memberDone = true;
    memberLoading = false;
    return;
  }

  memberLastDoc = snap.docs[snap.docs.length - 1];

  snap.forEach(docSnap => {
    const d = docSnap.data();
    const uid = docSnap.id;

    if (list.querySelector(`[data-id="${uid}"]`)) return;

    const row = document.createElement("div");
    row.className = "user-search-item member-row";
    row.dataset.id = uid;

    row.innerHTML = `
      <img loading='lazy' src="${base91ToImageSrc(d.photoURL)}" onerror="this.src='/image/default-avatar.jpg'"
           style="width:40px;height:40px;border-radius:10px;object-fit:cover;align-self:flex-start;">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px;">
          <strong style="cursor:pointer;" class="user-link">${escapeHTML(d.username)}</strong>
          <span style="color:grey;font-size:14px">${formatDate(d.joinedAt)}</span>
          ${canModerate ? `<button class="member-dots" style="font-size:20px !important;">⋮</button>` : ""}
        </div>
        <span style="font-size:15px;color:grey">${escapeHTML(uid)}</span>
      </div>
    `;

    row.addEventListener("click", () => {
      openUserSubProfile(uid);
      closecom();
      document.getElementById("communityOverlay").classList.add("hidden");
      document.querySelector(".communityo")?.remove();
      document.getElementById("memberOverlay").classList.add("hidden");
    });

    if (canModerate) {
      const dots = row.querySelector(".member-dots");
      dots.addEventListener("click", (e) => {
        e.stopPropagation(); 
        openMemberMenu({
          communityId: currentMemberCommunity,
          targetUid: uid,
          cData
        });
      });
    }

    list.appendChild(row);
  });

  memberLoading = false;
}

document.getElementById("memberSearch").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;

  const queryUid = e.target.value.trim();

  if (queryUid === memberQuery) return;
  memberQuery = queryUid;

  const list = document.getElementById("memberList");

  if (!queryUid) {
    list.innerHTML = "";
    memberLastDoc = null;
    memberDone = false;
    memberLoading = false;

    await renderOwnerFirst(cData, canModerate)
    await renderAdminsFirst(cData, canModerate);
    await loadMoreMembers(10, window.cData, true);
    return;
  }
  list.innerHTML = "";
  memberDone = true;
  memberLoading = true;

  const ref = doc(
    db,
    "communities",
    currentMemberCommunity,
    "members",
    queryUid
  );

  const snap = await getDoc(ref);
  const d = snap.data();

  if (!snap.exists()) {
    list.innerHTML = `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:20px;"><div style="max-width:400px;text-align:left;"><h2 style="margin:0;">No member found</h2><p style="color:grey;margin:7px 0;">Make sure you're typing the correct user ID (case sensitive)</p></div></div>`;
    memberLoading = false;
    return;
  }

  const isCreator = queryUid === window.cData.creatorId;
  const isAdmin = (window.cData.admin || []).includes(queryUid);

  let roleLabel = "";
  if (isCreator) {
    roleLabel = `<span style="color:#ff7a18;background:#15181c;padding:2px 6px;border-radius:5px;font-size:13px">creator</span>`;
  } else if (isAdmin) {
    roleLabel = `<span style="color:#f5c451;background:#15181c;padding:2px 6px;border-radius:5px;font-size:13px">admin</span>`;
  }

  const row = document.createElement("div");
  row.className = "user-search-item member-row";
  row.dataset.id = queryUid;

  row.innerHTML = `
      <img loading='lazy' src="${base91ToImageSrc(d.photoURL)}" onerror="this.src='/image/default-avatar.jpg'"
           style="width:40px;height:40px;border-radius:10px;object-fit:cover;align-self:flex-start;">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px;">
          ${roleLabel}
          <strong style="cursor:pointer;" class="user-link">${escapeHTML(d.username)}</strong>
          <span style="color:grey;font-size:14px">${formatDate(d.joinedAt)}</span>
          ${window.canModerate ? `<button class="member-dots" style="font-size:20px !important;">⋮</button>` : ""}
        </div>
        <span style="font-size:15px;color:grey">${escapeHTML(queryUid)}</span>
      </div>
  `;

  row.addEventListener("click", () => {
    openUserSubProfile(queryUid);
    closecom();
    document.getElementById("communityOverlay").classList.add("hidden");
    document.querySelector(".communityo")?.remove();
    document.getElementById("memberOverlay").classList.add("hidden");
  });

  if (canModerate) {
    const dots = row.querySelector(".member-dots");
    dots.addEventListener("click", (e) => {
      e.stopPropagation(); 
      openMemberMenu({
        communityId: currentMemberCommunity,
        targetUid: queryUid,
        cData
      });
    });
  }

  list.appendChild(row);
  memberLoading = false;
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

  const kickBtn  = overlay.querySelector(".member-kick");
  const banBtn   = overlay.querySelector(".member-ban");
  const adminBtn = overlay.querySelector(".member-admin-toggle");

  const close = () => overlay.classList.add("hidden");

  overlay.classList.remove("hidden");

  overlay.querySelector(".close-member-menu").onclick = close;
  overlay.onclick = (e) => e.target === overlay && close();

  kickBtn.style.display  = "none";
  banBtn.style.display   = "none";
  adminBtn.style.display = "none";

  const user = auth.currentUser;
  const isCreator = cData.creatorId === user.uid;
  const isAdmin   = (cData.admin || []).includes(user.uid);
  const isTargetCreator = cData.creatorId === targetUid;
  const isTargetAdmin   = (cData.admin || []).includes(targetUid);
  const canKickOrBanTarget = !isTargetCreator && !isTargetAdmin;

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
  const comSnap = await getDoc(comRef);
  const comData = comSnap.data();

  if (!isAdmin && (comData.admin || []).length >= 10) {
    log("red", "Admin limit reached");
    return;
  }

  if (isAdmin) {
    if (!(await confirmDialog("dismiss user as admin?", "are you sure you want to dismiss this user as admin?"))) return;
  } else {
    if (!(await confirmDialog("make user admin?", "are you sure you want to make this user admin? Once proceeded, This user can take dangerous actions to this community.", "red"))) return;
  }

  await updateDoc(comRef, {
    admin: isAdmin ? arrayRemove(uid) : arrayUnion(uid)
  });

  if (isAdmin) {
    log("green", "successfully dismissed this user as admin");
    window.cData.admin = window.cData.admin.filter(id => id !== uid);
  } else {
    window.cData.admin.push(uid);
    await sendAdminNotification(uid, window.communityID, comData.name, comData.creatorName, comData.creatorId);
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

  await Promise.all([
    deleteDoc(doc(db, "communities", comId, "members", uid)),
    updateDoc(doc(db, "communities", comId), {
      membersCount: increment(-1)
    }),
    updateDoc(doc(db, "users", uid), {
      communities: arrayRemove(comId)
    })
  ]);

  document.querySelector(`.member-row[data-id="${uid}"]`).remove();
  log("green", "Member kicked");
}

async function banMember(uid) {
  if (!(await confirmDialog("Ban user?", "are you sure you want to ban this user?", "red"))) return;

  const comId = window.communityID;
  const comRef = doc(db, "communities", comId);
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.data();

  await Promise.all([
    deleteDoc(doc(db, "communities", comId, "members", uid)),
    updateDoc(comRef, {
      membersCount: increment(-1),
    }),
    updateDoc(doc(db, "users", uid), {
      communities: arrayRemove(comId)
    }),
    setDoc(doc(db, "communities", comId, "bans", uid), {
      uid,
      bannedAt: new Date(),
      photoURL: data.photoURL,
      username: data.username
    })
  ]);

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
  const snap = await getDoc(comRef);
  if (!snap.exists()) return log("red", "Community not found");
  const cData = snap.data();

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.data();

  const isOwner = cData.creatorId === user.uid;
  const isAdmin  = (cData.admin || []).includes(user.uid);
  const isGlobalAdmin = userData?.role === "admin";

  editBtn.style.display = isOwner || isAdmin ? "flex" : "none";
  reportBtn.style.display = isOwner ? "none" : "flex";
  disbandBtn.style.display = (isGlobalAdmin) ? "flex" : "none";

  copyBtn.onclick = async () => {
    const link = `https://wyntr.netlify.app/community/${communityId}`;
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
    const communityEl = document.querySelector(".communityo .user-box");

    let screenshotBase64 = null;
    if (communityEl) {
      try {
        const canvas = await html2canvas(communityEl, { backgroundColor: null });
        screenshotBase64 = canvas.toDataURL("image/png");
      } catch (err) {
        console.error("Screenshot failed:", err);
      }
    }

    const data = snap.data();
    const { username } = await getUserData(data.creatorId);

    openReportOverlay({
      type: "community",
      id: communityId,
      text: data.name,
      link: `https://wyntr.netlify.app/community/${communityId}`,
      username: username,
      screenshot: screenshotBase64, 
    });
  };

  inviteBtn.style.display = (isOwner && cData.private === true || isAdmin && cData.private === true) ? "flex" : "none";

  inviteBtn.onclick = async () => {
    if (!isOwner && !isAdmin) return log("red", "Insufficient permission");
    const keyRef = doc(collection(db, "invites"));
    const expires = Date.now() + 24 * 60 * 60 * 1000; 

    await setDoc(keyRef, {
      expiredAt: expires,
      keyTo: communityId,
      used: false,
    });

    const inviteKey = keyRef.id;
    const link = `private://${inviteKey}`;

    try {
      await navigator.clipboard.writeText(link);
      log("green", "invite link copied");
    } catch {
      info("i", "Copy this link", link);
    }
    overlay.classList.add("hidden")
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

    const reqs = cData.requirements || {};
    document.getElementById("minFollowersInput").value = reqs.minFollowers ?? "";
    document.getElementById("minWSInput").value = reqs.minWS ?? "";
    document.getElementById("joinFeeInput").value = reqs.joinFee ?? "";
    document.getElementById("onlyFollowers").checked = reqs.mustFollow ?? false;
    document.getElementById("acceptApplicationCheck").checked = !!cData.acceptingApplications;
    document.getElementById("privateCheck").checked = !!cData.private;
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

    const typed = await inputDialog("Disband community", `Type the community name EXACTLY to confirm:\n${cData.name}`);
    if (typed !== cData.name) {
      log("red", "Name mismatch, cancelled");
      return;
    }

    const reason = await askDeleteReason();
    loading.classList.add("show");

    let screenshotBase64 = null;
    try {
      const box = document.querySelector(".communityo .user-box");
      if (box) {
        const canvas = await html2canvas(box, { backgroundColor: null });
        screenshotBase64 = canvas.toDataURL("image/png");
      }
    } catch (err) {
      console.error("Screenshot error:", err);
    }

    const { username: offenderName } = await getUserData(auth.currentUser.uid);
    const { username: creatorName } = await getUserData(cData.creatorId);

    const susRef = doc(db, "susList", cData.creatorId);
    const susSnap = await getDoc(susRef);
    const currentWarnings = susSnap.exists() ? susSnap.data().warnings || 0 : 0;

    const embed = {
      title: "Community Disbanded",
      color: 15105570,
      fields: [
        { name: "Name", value: cData.name || "(no name)" },
        { name: "Creator", value: creatorName || "(unknown)" },
        { name: "Total Members", value: cData.membersCount },
        { name: "Reason", value: reason || "No reason given" },
        { name: "Offender", value: offenderName || "(unknown)" },
        { name: "Creator warnings", value: `${currentWarnings + 1}` },
      ],
      timestamp: new Date(),
    };

    if (screenshotBase64) {
      embed.image = { url: "attachment://screenshot.png" };
    }

    const members = cData.members || [];
    for (const uid of members) {
      await updateDoc(doc(db, "users", uid), {
        communities: arrayRemove(communityId),
      });
    }
    await deleteDoc(comRef);

    await sendToDiscord(null, { embeds: [embed] }, screenshotBase64);
    const { displayName } = await getUserData(auth.currentUser.uid);
    await sendCommunityWarningNotification(cData.creatorId, cData.name, reason, displayName);

    loading.classList.remove("show");
    log("green", "Community has been disbanded");
    overlay.classList.add("hidden");
    document.querySelector(".communityo")?.remove();
    document.querySelectorAll(`.com-item[data-id="${communityId}"]`).forEach(el => el.remove());
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

window.addEventListener("DOMContentLoaded", async () => {
  const user = await waitForAuth();

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
});

document.getElementById("searchCom")?.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;  

    let term = e.target.value.trim();
    if (term.startsWith("private://")) {
      const key = term.replace("private://", "");

      const keyRef = doc(db, "invites", key);
      const keySnap = await getDoc(keyRef);

      if (!keySnap.exists()) return log("red", "Invalid invite key");

      const keyData = keySnap.data();
      const now = Date.now();

      if (keyData.used === true) return log("red", "This invite key is already used");
      if (keyData.expiredAt < now) return log("red", "This invite key is expired");

      await updateDoc(keyRef, { used: true });
      e.target.value = "";
      return openCommunity(keyData.keyTo);
    } else {
      term = e.target.value.trim().toLowerCase();
    }

    const list = document.getElementById("communityList");
    list.innerHTML = "";

    if (!term) {
      loadingComList = true;
      await loadCommunities(true);
      loadingComList = false;
      return;
    }

    const q = query(
      collection(db, "communities"),
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

    const userRef = doc(db, "users", auth.currentUser.uid);
    const userSnap = await getDoc(userRef);

    for (const docSnap of snap.docs) {
      const c = docSnap.data();

      if (c.private === true) continue;

      const wrapper = document.createElement("div");
      wrapper.className = "com-item";
      wrapper.dataset.id = c.id;

      const userData = userSnap.data();
      const joined = (userData.communities || []).includes(c.id);

      const tagsHtml = (c.tags || [])
      .map(t => `<span class="tag-badge">${escapeHTML(t)}</span>`)
      .join("");

      wrapper.innerHTML = `
        <div>
          <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:5px;">
            <div style="min-height:43px;min-width:43px;border-radius:5px;background:url('${base91ToImageSrc(c.avatar)}') no-repeat center / cover"></div>
            <div style="display:flex;flex-direction:column;max-width:300px;">
              <strong>${escapeHTML(c.name)}</strong>
              <span style="color:grey;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${escapeHTML(c.description) || "No description"}
              </span>
            </div>
            ${joined ? `<div style="color:grey;font-size:15px;margin-left:auto;">Joined</div>` : ""}
          </div>
          <span style="color:grey;font-size:14px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;display:block;display:flex;gap:5px;align-items:Center;">
            ${formatNumber(c.posts)} posts •
            by ${escapeHTML(c.creatorName)} •
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
    container.innerHTML = `
      <div id="communityloadingbitches" style="margin:45px -20px;">  <div class="skeleton-card">
        <div class="skeleton-header">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-header-lines">
            <div class="skeleton-line short"></div>
          </div>
          <div class="skeleton-dot"></div>
        </div>
        <div class="skeleton-body">
          <div class="skeleton-line long"></div>
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
        </div>
        <div class="skeleton-footer">
          <div class="skeleton-pill small"></div>
          <div class="skeleton-pill small"></div>
          <div class="skeleton-pill small"></div>
          <div class="invisible skeleton-pill small"></div>
          <div class="skeleton-pill small last"></div>
        </div>
      </div>
      <div class="skeleton-card">
        <div class="skeleton-header">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-header-lines">
            <div class="skeleton-line short"></div>
          </div>
          <div class="skeleton-dot"></div>
        </div>
        <div class="skeleton-body">
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line long"></div>
          <div class="skeleton-line short"></div>
        </div>
        <div class="skeleton-footer">
          <div class="skeleton-pill small"></div>
          <div class="skeleton-pill small"></div>
          <div class="skeleton-pill small"></div>
          <div class="invisible skeleton-pill small"></div>
          <div class="skeleton-pill small last"></div>
        </div>
      </div>
      <div class="skeleton-card">
        <div class="skeleton-header">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-header-lines">
            <div class="skeleton-line short"></div>
          </div>
          <div class="skeleton-dot"></div>
        </div>
        <div class="skeleton-body">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line long"></div>
          <div class="skeleton-line medium"></div>
        </div>
        <div class="skeleton-footer">
          <div class="skeleton-pill small"></div>
          <div class="skeleton-pill small"></div>
          <div class="skeleton-pill small"></div>
          <div class="invisible skeleton-pill small"></div>
          <div class="skeleton-pill small last"></div>
        </div>
      </div>
    </div>`;
    lastVisibleCommunityTweet = null;
    noMoreCommunityTweets = false;

    if (window.cData?.pinned && window.cData.pinned !== "") {
      const pinnedId = window.cData.pinned;

      try {
        const pinnedRef = doc(db, "communities", communityId, "posts", pinnedId);
        const pinnedSnap = await getDoc(pinnedRef);

        if (pinnedSnap.exists()) {
          const label = document.createElement("div");
          label.className = "pinned-label";
          label.innerHTML = `
            <div class="iq pinlabel communityPinned-${pinnedId}" style="background:var(--color);margin-top:40px;width:fit-content;font-size:13px;margin-left:-5px;">Pinned by community admins</div>
          `;

          if (!container.querySelector(".tweet") && !container.querySelector(".pinned-label") && container.querySelector("#communityloadingbitches")) container.querySelector("#communityloadingbitches").remove();
          if (container.querySelector("#communitynobitches")) container.querySelector("#communitynobitches").remove();

          container.appendChild(label);

          await renderTweet(
            pinnedSnap.data(),
            pinnedId,
            user,
            "append",
            container,
            communityId
          );
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
      startAfter(lastVisibleCommunityTweet),
      limit(3)
    );
  } else {
    q = query(
      baseRef,
      orderBy("createdAt", "desc"),
      limit(3)
    );
  }

  const snap = await getDocs(q);
  if (snap.empty) {
    if (!container.querySelector(".tweet")) {
     container.innerHTML = `
          <div id="communitynobitches" style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:60px;">
            <div style="max-width:400px;text-align:left;">
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

  for (const docSnap of snap.docs) {
    const id = docSnap.id;

    if (window.cData?.pinned && window.cData.pinned === id) continue;
    if (!container.querySelector(".tweet") && !container.querySelector(".pinned-label") && container.querySelector("#communityloadingbitches")) container.querySelector("#communityloadingbitches").remove();
    if (container.querySelector("#communitynobitches")) container.querySelector("#communitynobitches").remove();

    await renderTweet(docSnap.data(), id, user, "append", container, communityId);
  }
}

document.body.addEventListener("click", async (e) => { 
  const communityLink = e.target.closest(".communityLink");
  if (communityLink) {
    const id = communityLink.dataset.id;
    openCommunity(id);
  }
});

async function sendCommunityDisbandLog(cData, communityId, reason, screenshotBase64) {
  const embed = {
    title: "Community Disbanded",
    color: 15105570, 
    fields: [
      { name: "Name", value: cData.name },
      { name: "ID", value: communityId },
      { name: "Creator", value: cData.creatorName },
      { name: "Total Members", value: `${cData.membersCount}` },
      { name: "Reason", value: reason || "No reason given" },
    ],
    timestamp: new Date(),
  };

  if (screenshotBase64) {
    embed.image = { url: "attachment://screenshot.png" };
  }

  await sendToDiscord(null, { embeds: [embed] }, screenshotBase64);
}

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
        const user = auth.currentUser;
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        const allIds = snap.data()?.communities || [];

        if (myComOffset >= allIds.length) return;

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
const MIN_LEN = 3;
const TWEETS_PAGE = 10;

let previousTerm = "";
let lastTweetDoc = null;

searchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    const term = searchInput.value.trim();   
    if (term === previousTerm) return;
    previousTerm = term;
    if (term.length >= MIN_LEN) {
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