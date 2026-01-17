import { db, auth, doc, getDoc, collection, query, getDocs, limit, orderBy, where, Timestamp } from "./firebase.js";
import { loadFollowing, getUserData } from "./index.js";
import { escapeHTML, formatDate } from "./texts.js";
import { base91ToImageSrc } from "./attachments.js";

function getFollowingFromIDB(uid) {
  return new Promise((resolve) => {
    if (window.followingUserCache instanceof Map) {
      return resolve(window.followingUserCache);
    }

    document.addEventListener("following-cache-ready", () => {
      resolve(window.followingUserCache);
    }, { once: true });

    if (!window.followingUserCacheRequested) {
      window.followingUserCacheRequested = true;
      loadFollowing(uid); 
    }
  });
}

async function loadWhoToFollow() {
  const container = document.getElementById("whotofollow");
  if (!container) return;

  await getFollowingFromIDB(auth.currentUser.uid);
  container.innerHTML = `<div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div><div class="skeleton-card"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-header-lines"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div></div></div>`;

  try {
    const uid = auth.currentUser.uid;
    if (!uid) return;

    const CACHE_KEY = `whotofollow_${uid}`;
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached && Date.now() - cached.timestamp < WEEK_MS) {
      renderWhoToFollowResults(cached.users, container);
      return;
    }

    const meSnap = await getDoc(doc(db, "users", uid));
    const myInterestsArr = meSnap.data()?.interest || [];

    const freqMap = arr => {
      const map = {};
      arr.forEach(x => map[x] = (map[x] || 0) + 1);
      return map;
    };

    const myFreq = freqMap(myInterestsArr);

    const similarity = (a, b) => {
      let score = 0;
      for (const tag in a) {
        if (b[tag]) score += Math.min(a[tag], b[tag]);
      }
      return score;
    };

    if (myInterestsArr.length === 0) {
      console.warn("User has no interests: fallback mode");

      const q = query(collection(db, "users"), limit(100));
      const snap = await getDocs(q);

      const result = snap.docs
        .filter(docSnap =>
          docSnap.id !== uid &&
          (docSnap.data().interest || []).length > 0 
        )
        .slice(0, 3)
        .map(docSnap => {
          const d = docSnap.data();
          return {
            uid: docSnap.id,
            username: d.username,
            avatar: d.photoURL,
            interest: d.interest || []
          };
        });

      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ timestamp: Date.now(), users: result })
      );

      renderWhoToFollowResults(result, container);
      return;
    }

    const allSnap = await getDocs(query(collection(db, "users"), limit(100)));
    const candidates = [];

    allSnap.forEach(docSnap => {
      if (docSnap.id === uid) return;

      const data = docSnap.data();
      const theirInterest = data.interest || [];
      if (!theirInterest.length) return;

      const theirFreq = freqMap(theirInterest);
      const score = similarity(myFreq, theirFreq);

      candidates.push({
        uid: docSnap.id,
        score,
        username: data.displayName,
        avatar: data.photoURL,
        interest: theirInterest,
        desc: data.description,
      });
    });

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.followers || 0) - (a.followers || 0);
    });

    const top4 = candidates.slice(0, 3);

    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), users: top4 })
    );

    renderWhoToFollowResults(top4, container);

  } catch (err) {
    console.error("Failed:", err);
    container.innerHTML = "<p style='margin-left:15px;'>Error loading Who To Follow</p>";
  }
}

async function renderWhoToFollowResults(users, container) {
  container.innerHTML = "";

  const freqMap = arr => {
    const map = {};
    arr.forEach(x => map[x] = (map[x] || 0) + 1);
    return map;
  };

  for (const user of users) {
    const { uid, username, avatar, interest, desc } = user;

    let dominantTags = [];

    if (interest && interest.length > 0) {
      const freq = freqMap(interest);

      dominantTags = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])  
        .slice(0, 3)                  
        .map(([tag]) => tag);        
    }

    const isFollowed =
      window.currentUserFollowing instanceof Set &&
      window.currentUserFollowing.has(uid);
    const followHTML = isFollowed
      ? `<span style="color:grey;font-size:13px;margin-left:auto;">Followed</span>`
      : "";

    const div = document.createElement("div");
    div.className = "who-item";

    div.innerHTML = `
      <div>
        <div class="user-link" data-uid="${uid}" style="display:flex;gap:10px;align-items:flex-start;margin-bottom:5px;">
          <div style="min-height:43px;min-width:43px;max-height:43px;max-width:45px;margin-top:4px;border-radius:10px;background:url('${base91ToImageSrc(avatar) || '/image/default-avatar.jpg'}') no-repeat center / cover"></div>
          <div style="display:flex;gap:3px;flex-direction:column;max-width:300px;overflow:hidden;">
            <strong style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">${escapeHTML(username) || "Unnamed"}</strong>
            <span style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;color:grey">
               ${escapeHTML(desc || "no description")}
             </span>
          </div>
          ${followHTML}
        </div>
      </div>
    `;

    container.appendChild(div);
  }
}

async function loadWhatsHappening() {
  const container = document.getElementById("whatshappening");
  if (!container) return;

  const CACHE_KEY = "whatsHappeningCommunities";
  const CACHE_TIME_KEY = "whatsHappeningTimestamp";
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

  const cached = localStorage.getItem(CACHE_KEY);
  const savedTime = localStorage.getItem(CACHE_TIME_KEY);

  const user = auth.currentUser;
  if (!user) return;

  const userSnap = await getDoc(doc(db, "users", user.uid));
  const userData = userSnap.data() || {};

  if (cached && savedTime && (Date.now() - Number(savedTime) < ONE_WEEK)) {
    const communities = JSON.parse(cached);
    renderCommunities(container, communities, userData);
    return;
  }

  const interest = userData.interest || [];

  const MAX_COUNT = 3;
  let communities = [];

  if (interest.length > 0) {
    const freq = interest.reduce((m, t) => {
      m[t] = (m[t] || 0) + 1;
      return m;
    }, {});

    const q = query(
      collection(db, "communities"),
      orderBy("membersCount", "desc"),
      limit(30)
    );

    const snapshot = await getDocs(q);

    snapshot.forEach(docSnap => {
      const c = docSnap.data();
      if (c.private) return;

      const score = (c.tags || []).reduce((sum, tag) => sum + (freq[tag] || 0), 0);

      if (score > 0) communities.push({ ...c, score });
    });

    communities.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.membersCount - a.membersCount;
    });

    communities = communities.slice(0, MAX_COUNT);
  }

  if (communities.length < MAX_COUNT) {
    const needed = MAX_COUNT - communities.length;

    const q = query(
      collection(db, "communities"),
      orderBy("membersCount", "desc"),
      limit(10)
    );

    const snapshot = await getDocs(q);

    snapshot.forEach(docSnap => {
      if (communities.length >= MAX_COUNT) return;

      const c = docSnap.data();
      if (c.private) return;
      if (communities.find(x => x.id === c.id)) return;

      communities.push(c);
    });
  }

  localStorage.setItem(CACHE_KEY, JSON.stringify(communities));
  localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());

  container.innerHTML = "";
  renderCommunities(container, communities, userData);
}

function renderCommunities(container, communities, userData) {
  container.innerHTML = "";
  communities.forEach(cData => {
    const joined = (userData.communities || []).includes(cData.id);
    let joinedStatus = joined
      ? `<div style="color:grey;font-size:14px;margin-left:auto;">Joined</div>`
      : "";

    const wrapper = document.createElement("div");
    wrapper.className = "com-item";
    wrapper.dataset.id = cData.id;

    wrapper.innerHTML = `
      <div>
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:5px;">
          <div style="min-height:43px;min-width:43px;max-height:43px;max-width:45px;margin-top:4px;border-radius:10px;background:url('${base91ToImageSrc(cData.avatar) || '/image/default.png'}') no-repeat center / cover"></div>
          <div style="display:flex;gap:3px;flex-direction:column;max-width:300px;overflow:hidden;">
            <strong class="communityLink" data-id="${cData.id}" style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">${escapeHTML(cData.name)}</strong>
            <span style="text-overflow:ellipsis;white-space:nowrap;overflow:hidden;color:grey">${escapeHTML(cData.description) || `No description`}</span>
          </div>
          ${joinedStatus}
        </div>
      </div>
    `;

    container.appendChild(wrapper);
  });
}

export { loadWhoToFollow, loadWhatsHappening }