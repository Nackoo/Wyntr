export const bookmark          = document.getElementById('bookmarkOverlay');
export const profile           = document.getElementById('profileOverlay');
export const profilesub        = document.getElementById('profileSubOverlay');
export const user              = document.getElementById('userOverlay');
export const usersub           = document.getElementById('userSubOverlay');
export const tag               = document.getElementById('tagSubOverlay');
export const viewer            = document.getElementById('tweetViewer');
export const tweet             = document.getElementById('tweetOverlay');
export const retweet           = document.getElementById('retweetOverlay');
export const notification      = document.getElementById('notificationOverlay');
export const comment           = document.getElementById('commentOverlay');
export const me                = document.getElementById("meOverlay");
export const bookmarkoverlay   = document.getElementById("bookmarkFolderOverlay");
export const bookmarktweet     = document.getElementById("bookmarkTweetOverlay");
export const commentViewer     = document.getElementById("commentViewer");
export const premiumsvg        = document.getElementById("premiumOverlay1");
export const community         = document.getElementById("communityOverlay");
export const comsearch         = document.getElementById("communitySearch");
export const block             = document.getElementById("blockOverlay");
export const profilecom        = document.getElementById("profileCom");
export const quote             = document.getElementById("quoteViewer");

export const bookmarksvg       = document.getElementById("bookmarksvg");
export const homesvg           = document.getElementById("homesvg");
export const usersvg           = document.getElementById("usersvg");
export const searchsvg         = document.getElementById("searchsvg");
export const settingssvg       = document.getElementById("settingssvg");
export const notifsvg          = document.getElementById("notifsvg1");
export const premium           = document.getElementById("premiumsvg");
export const communitysvg      = document.getElementById("comsvg");

export const bookmarkfilled    = document.getElementById("bookmarkfilled");
export const homefilled        = document.getElementById("homefilled");
export const userfilled        = document.getElementById("userfilled");
export const searchfilled      = document.getElementById("searchfilled");
export const settingsfilled    = document.getElementById("settingsfilled");
export const notiffilled       = document.getElementById("notiffilled");
export const premiumfilled     = document.getElementById("premiumfilled");
export const communityfilled   = document.getElementById("comfilled");

const tabcontent               = document.querySelectorAll(".tab-content");
const tweetsTab                = document.querySelector('.tab1[data-target="tweetsView"]');
const tweetsView               = document.getElementById("tweetsView");
const tab1                     = document.querySelectorAll(".tab1");
const tab3                     = document.querySelectorAll(".tab3");
const tweetsTab1               = document.querySelector(".tab3[data-target='userList']")
const list                     = document.getElementById("youList");
const usermentionedList        = document.getElementById("mentionedList");
const list1                    = document.getElementById("userList");
const usermentionedList1       = document.getElementById("usermentionedList");
const comRule                  = document.getElementById("comRule");

import { loadCommunities } from "./community.js";

function tweetviewactive() {
  tabcontent.forEach(c => c.classList.add("hidden"));
  tweetsView.classList.remove("hidden");
  tab1.forEach(t => t.classList.remove("active"));
  tweetsTab.classList.add("active");
}

export function tweetviewactive1() {
  usermentionedList1.style.display = "none";
  list1.style.display = "block";
  tab3.forEach(t => t.classList.remove("active"));
  if (tweetsTab1) tweetsTab1.classList.add("active");
}

export function youListActive() {
  usermentionedList.style.display = "none";
  list.style.display = "block";
  document.querySelectorAll(".tab2").forEach(t => t.classList.remove("active"));
  const youListTab = document.querySelector('.tab2[data-target="youList"]');
  if (youListTab) youListTab.classList.add("active");
}

const panelsToHide = () => [
  profile, 
  profilesub, 
  user, 
  usersub, 
  tag, 
  document.getElementById("followOverlay"), 
  viewer, 
  tweet, 
  retweet, 
  bookmark, 
  notification, 
  comment, 
  me, 
  commentViewer, 
  bookmarkoverlay, 
  bookmarktweet, 
  premiumsvg, 
  community,
  block,
  profilecom,
  quote
];

const filledIcons = [
  settingsfilled,
  homefilled,
  bookmarkfilled,
  userfilled,
  searchfilled,
  notiffilled,
  premiumfilled,
  communityfilled
];

const outlineIcons = {
  bookmarksvg,
  homesvg,
  usersvg,
  searchsvg,
  settingssvg,
  notifsvg,
  premium,
  communitysvg
};

const overlayMap = {
  bookmarksvg:    bookmark,
  usersvg:        profile,
  searchsvg:      user,
  settingssvg:    profilesub,
  notifsvg:       notification,
  premium:        premiumsvg,
  communitysvg:   community
};

const filledIconMap = {
  bookmarksvg:    bookmarkfilled,
  homesvg:        homefilled,
  usersvg:        userfilled,
  searchsvg:      searchfilled,
  settingssvg:    settingsfilled,
  notifsvg:       notiffilled,
  premium:        premiumfilled,
  communitysvg:   communityfilled
};

const clickHandler = (clickedIcon) => {
  return () => {
    panelsToHide().forEach(p => p?.classList.add("hidden"));
    filledIcons.forEach(icon => icon?.classList.add("hidden"));
    Object.values(outlineIcons).forEach(icon => icon?.classList.remove("hidden"));
    outlineIcons[clickedIcon]?.classList.add("hidden");
    filledIconMap[clickedIcon]?.classList.remove("hidden");
    overlayMap[clickedIcon]?.classList.remove("hidden");
    document.getElementById("tweetMenuOverlay").classList.add("hidden");
    document.getElementById("cMenuOverlay").classList.add("hidden");
    tweetviewactive();
    hideCom();
  };
};

Object.keys(outlineIcons).forEach(iconName => {
  const icon = outlineIcons[iconName];
  if (icon) {
    icon.addEventListener("click", clickHandler(iconName));
    me.classList.add('hidden');
    community.classList.add("hidden");
    commentViewer.classList.add("hidden");
    bookmarkoverlay.classList.add("hidden");
    bookmarktweet.classList.add("hidden");
    hideCom();
  }
});

function hideCom() {
  document.querySelector(".communityo")?.classList.add("hidden");
  document.getElementById("skibidicome").classList.add("hidden");
  window.communityID = null; 
  window.isOnPrivate = false;
  comRule.style.display = "none";
  comsearch.classList.add("hidden");
  document.getElementById("commentSearch").classList.add("hidden");
  document.getElementById("memberOverlay").classList.add("hidden");
  document.getElementById("inviteOverlay").classList.add("hidden");
  document.getElementById("banOverlay").classList.add("hidden");
}

function hidebookmark() {
  bookmark.classList.add('hidden');
  homesvg.classList.add('hidden');
  bookmarkfilled.classList.add('hidden');
  bookmarksvg.classList.remove('hidden');
  homefilled.classList.remove('hidden');
  settingsfilled.classList.add("hidden");
  settingssvg.classList.remove("hidden");
  profilesub.classList.add("hidden");
}

function hideprofile() {
  document.querySelector('#profileOverlay').classList.add('hidden');
  homesvg.classList.add('hidden');
  homefilled.classList.remove('hidden');
  userfilled.classList.add('hidden');
  usersvg.classList.remove('hidden');
}

function hideuser() {
  user.classList.add('hidden');
  homesvg.classList.add('hidden');
  homefilled.classList.remove('hidden');
  searchfilled.classList.add('hidden');
  searchsvg.classList.remove('hidden');
  tweetviewactive();
}

function hidesettings() {
  document.querySelector('#meOverlay').classList.add('hidden');
}

function hidenotif() {
  notification.classList.add('hidden');
  homesvg.classList.add('hidden');
  homefilled.classList.remove('hidden');
  notiffilled.classList.add('hidden');
  notifsvg.classList.remove('hidden');
}

function closeUser() {
  usersub?.classList.add('hidden');
  user.classList.remove('hidden');
  tweetviewactive();
}

document.getElementById("hideProfile").addEventListener("click", () => {
  profilesub.classList.add("hidden");
  homesvg.classList.add("hidden");
  homefilled.classList.remove("hidden");
  settingssvg.classList.remove("hidden");
  settingsfilled.classList.add("hidden");
});

window.hideprofile  = hideprofile;
window.hideuser     = hideuser;
window.hidebookmark = hidebookmark;
window.hidesettings = hidesettings;
window.hidenotif    = hidenotif;
window.closeUser    = closeUser;

document.body.addEventListener("click", async (e) => {
  const userLink = e.target.closest(".user-link");
  if (userLink && userLink.dataset.uid) {
    const uid = userLink.dataset.uid;
    if (uid) {
      hideCom();
      quote.classList.add("hidden");
      usersub.classList.remove("hidden");
      community.classList.add("hidden");
      premiumfilled.classList.add("hidden");
      premium.classList.remove("hidden");
      premiumsvg.classList.add("hidden");
      document.getElementById("followOverlay")?.classList.add('hidden');
      bookmarkoverlay.classList.add("hidden");
      bookmarktweet.classList.add("hidden");
      commentViewer.classList.add("hidden");
      bookmark.classList.add("hidden");
      comment.classList.add('hidden');
      user.classList.add('hidden');
      homefilled.classList.add('hidden');
      homesvg.classList.remove('hidden');
      searchsvg.classList.add('hidden');
      searchfilled.classList.remove('hidden');
      profile.classList.add('hidden');
      userfilled.classList.add('hidden');
      block.classList.add("hidden");
      usersvg.classList.remove('hidden');
      notiffilled.classList.add('hidden');
      notifsvg.classList.remove('hidden');
      viewer.classList.add('hidden');
      bookmarkfilled.classList.add("hidden");
      settingsfilled.classList.add('hidden');
      bookmarksvg.classList.remove('hidden');
      settingssvg.classList.remove('hidden');
      communitysvg.classList.remove("hidden");
      communityfilled.classList.add("hidden");
      await window.openUserSubProfile(uid);
    }
  }
});

document.body.addEventListener("click", async (e) => {
  const communityLink = e.target.closest(".communityLink");
  if (communityLink && communityLink.dataset.id) {
      community.classList.remove("hidden");
      quote.classList.add("hidden");
      document.getElementById("myCommunities").classList.add("hidden");
      document.getElementById("communityList").classList.remove("hidden");
      document.querySelector(".tab5[data-target='myCommunities']").classList.remove("active");
      document.querySelector(".tab5[data-target='communityList']").classList.add("active");
      document.getElementById("searchCom").classList.remove("hidden");
      document.getElementById("searchMyCom").classList.add("hidden");
      if (!document.querySelector("#communityList .com-item")) {
        loadCommunities();
      }
      profilecom.classList.add("hidden");
      communitysvg.classList.add("hidden");
      communityfilled.classList.remove("hidden");
      document.getElementById("memberOverlay").classList.add("hidden");
      document.getElementById("banOverlay").classList.add("hidden");
      premiumfilled.classList.add("hidden");
      premium.classList.remove("hidden");
      bookmarkoverlay.classList.add("hidden");
      premiumsvg.classList.add("hidden");
      bookmarkoverlay.classList.add("hidden");
      bookmarktweet.classList.add("hidden");
      viewer.classList.add('hidden');
      profile.classList.add('hidden');
      commentViewer.classList.add("hidden");
      usersub.classList.add('hidden');
      bookmark.classList.add("hidden");
      comment.classList.add('hidden');
      user.classList.add('hidden');
      homefilled.classList.add('hidden');
      homesvg.classList.remove('hidden');
      userfilled.classList.add('hidden');
      usersvg.classList.remove('hidden');
      bookmarkfilled.classList.add('hidden');
      bookmarksvg.classList.remove('hidden');
      searchsvg.classList.remove('hidden');
      searchfilled.classList.add('hidden');
      notiffilled.classList.add('hidden');
      notifsvg.classList.remove('hidden');
      viewer.classList.add('hidden');
      bookmarkfilled.classList.add("hidden");
      settingsfilled.classList.add('hidden');
      bookmarksvg.classList.remove('hidden');
      settingssvg.classList.remove('hidden');
  }
})

document.body.addEventListener("click", async (e) => {
  const tagLink = e.target.closest(".tag-link");
  if (tagLink && tagLink.dataset.tag) {
    const tag = tagLink.dataset.tag.toLowerCase().slice(0, 30);
    if (tag) {
      hideCom();
      quote.classList.add("hidden");
      community.classList.add("hidden");
      premiumfilled.classList.add("hidden");
      premium.classList.remove("hidden");
      bookmarkoverlay.classList.add("hidden");
      premiumsvg.classList.add("hidden");
      bookmarktweet.classList.add("hidden");
      viewer.classList.add('hidden');
      profile.classList.add('hidden');
      commentViewer.classList.add("hidden");
      usersub.classList.add('hidden');
      comment.classList.add('hidden');
      bookmark.classList.add("hidden");
      user.classList.remove('hidden');
      homefilled.classList.add('hidden');
      homesvg.classList.remove('hidden');
      userfilled.classList.add('hidden');
      usersvg.classList.remove('hidden');
      bookmarkfilled.classList.add('hidden');
      bookmarksvg.classList.remove('hidden');
      searchsvg.classList.add('hidden');
      searchfilled.classList.remove('hidden');
      notiffilled.classList.add('hidden');
      notifsvg.classList.remove('hidden');
      viewer.classList.add('hidden');
      bookmarkfilled.classList.add("hidden");
      settingsfilled.classList.add('hidden');
      bookmarksvg.classList.remove('hidden');
      settingssvg.classList.remove('hidden');
      communitysvg.classList.remove("hidden");
      communityfilled.classList.add("hidden");
      await window.openTag(tag);
    }
  }
});

function goHome() {
  history.pushState({}, "", "/");
  if (!document.getElementById("commentViewer")) {
    document.getElementById("tweetViewer")?.classList.add("hidden");
  }
  document.body.classList.remove("no-scroll");
  const homePanel = document.getElementById("tweetsView");
  if (homePanel) homePanel.classList.remove("hidden");
}

[bookmarksvg, usersvg, searchsvg, settingssvg, notifsvg, homesvg].forEach(btn => {
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      goHome();
    });
  }
});

["post", "tweetViewerclose", "commentviewerclose"].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      goHome();
    });
  }
});

document.body.addEventListener("click", (e) => {
  const closeProfile   = e.target.closest(".close-profile-menu");
  const closeuser      = e.target.closest(".close-user-menu");
  const closeWelcome   = e.target.closest("#closeWelcome");
  const closecom       = e.target.closest("#close-com");
  const closepremium   = e.target.closest("#closePremium");
  const closePremium1  = e.target.closest("#closePremium1");
  const closeComment   = e.target.closest(".closeComment");
  const closeTweetMenu = e.target.closest(".close-menu");
  const closeCMenu     = e.target.closest(".close-cmenu");
  const closecomrule   = e.target.closest("#close-com-rule");
  const closenotif     = e.target.closest(".close-notif-menu");

  if (closenotif) {document.getElementById("notifMenuOverlay").classList.add("hidden");}
  if (closecomrule) { document.getElementById("skibidicome").classList.add("hidden") }
  if (closecom) {community.classList.add('hidden'); communitysvg.classList.remove("hidden"); communityfilled.classList.add("hidden"); homesvg.classList.add("hidden"); homefilled.classList.remove("hidden"); comRule.style.display = "none";}
  if (closeWelcome) {document.getElementById("welcomeOverlay").classList.add("hidden");}
  if (closepremium) {document.getElementById("premiumOverlay1").classList.add("hidden");premiumfilled.classList.add("hidden");premium.classList.remove("hidden");settingssvg.classList.remove("hidden");settingsfilled.classList.add("hidden");homesvg.classList.add("hidden");homefilled.classList.remove("hidden");profilesub.classList.add("hidden")}
  if (closePremium1) {document.getElementById("premiumOverlay").classList.add("hidden");}
  if (closeProfile) {document.getElementById("profileMenuOverlay").classList.add("hidden");}
  if (closeuser) {document.getElementById("userMenuOverlay").classList.add("hidden");}
  if (closeTweetMenu) {const menu = closeTweetMenu.closest(".tweet-menu");if (menu) menu.classList.add("hidden");}
  if (closeCMenu) {document.getElementById("cMenuOverlay").classList.add("hidden");}
  if (closeComment) {document.getElementById("commentOverlay").classList.add("hidden");}
  if (!e.target.closest(".menubtn") && !e.target.closest(".tweet-menu")) {document.querySelectorAll(".tweet-menu").forEach(m => m.classList.add("hidden"));}
  if (!e.target.closest(".cmenubtn") && !e.target.closest(".c-menu")) {document.querySelectorAll("#cMenuOverlay").forEach(m => m.classList.add("hidden"))}
});