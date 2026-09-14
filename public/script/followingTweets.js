import { auth, db,collection, getDocs, query, orderBy, limit, where, startAfter, onSnapshot } from "./firebase.js";

import { renderTweet, scoreTweet } from "./index.js";
import { cacheGet } from "./cache.js";
import { log } from "./texts.js";
import { TWEETS_SKELETON } from "./element.js";

const followingContainer = document.getElementById("following1");

let followingBatchIndex = 0;
let followingLoading = false;
let followingLastDoc = null;

const FOLLOWING_BATCH_SIZE = 30;

export async function loadFollowingTweets(reset = false) {
    if (followingLoading) return;

    if (reset) {
        followingBatchIndex = 0;
        followingLastDoc = null;

        followingContainer.innerHTML = TWEETS_SKELETON;
    }

    followingLoading = true;

    try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const followings = await cacheGet(`followings_${uid}`);

        if (!Array.isArray(followings) || followings.length === 0) {
            if (!followingContainer.querySelector(".tweet")) {
              followingContainer.innerHTML = `
                    <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
                      <div style="max-width:400px;text-align:left;margin:0 40px"><h2 style="margin:0;">You're not following anyone</h2>
                      </div>
                    </div>
                  `;
            }
            return;
        }

        const totalBatches = Math.ceil(
            followings.length / FOLLOWING_BATCH_SIZE
        );

        const currentBatch =
            followingBatchIndex % totalBatches;

        const start = currentBatch * FOLLOWING_BATCH_SIZE;

        const batch = followings.slice(
            start,
            start + FOLLOWING_BATCH_SIZE
        );

        if (batch.length === 0) {
            return;
        }

        const constraints = [
            where("uid", "in", batch),
            where("archived", "!=", true),
            limit(30)
        ];

        if (followingBatchIndex > 0 && followingLastDoc) {
            constraints.push(startAfter(followingLastDoc));
        }

        const q = query(
            collection(db, "tweets"),
            ...constraints
        );

        const snapshot = await getDocs(q);

        snapshot.forEach(docSnap => {
            const tdata = docSnap.data();

            renderTweet(
                tdata,
                docSnap.id,
                auth.currentUser,
                "append",
                followingContainer
            );
        });

        if (!snapshot.empty) {
            followingLastDoc =
                snapshot.docs[snapshot.docs.length - 1];
        } else if (!followingContainer.querySelector(".tweet")) {
            followingContainer.innerHTML = `
                <div style="width:100%;display:flex;justify-content:center;align-items:center;margin-top:30px;">
                    <div style="max-width:400px;text-align:left;margin:0 40px"><h2 style="margin:0;">No post from your followings</h2>
                    </div>
                </div>
            `;
        }

        followingBatchIndex++;

        if (!followingContainer.querySelector(".tweet")) followingContainer.innerHTML = ""

    } catch (error) {
        console.error(
            "Failed to load following tweets:",
            error
        );
    } finally {
        followingLoading = false;
    }
}