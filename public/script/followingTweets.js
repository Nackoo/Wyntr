import { auth, db, collection, getDocs, query, orderBy, limit, where, startAfter, onSnapshot } from "./firebase.js";
import { renderTweet, scoreTweet } from "./index.js"; 
// import { getFollowingIdsFromCache } from "./followingCache.js";
import { log } from "./texts.js";

const followingContainer = document.getElementById("following1");

export async function loadFollowingTweets(reset = false) {
    followingContainer.innerHTML = `
      <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
        <div style="max-width:400px;text-align:left;margin:0 40px"><h2 style="margin:0;">Feature unavailable</h2><p style="color:grey;margin:7px 0;">This feature is still being under construction and will be updated soon.</p>
        </div>
      </div>
    `;
}