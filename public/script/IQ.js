import { doc, getDoc, updateDoc, setDoc, db } from "./firebase.js";

const HISTORY_LIMIT = 20;

async function textSignature(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toLowerCase().replace(/\W+/g, ""));
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex.slice(0, 10);
}

function vectorize(text) {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const counts = {};
  for (const w of words) counts[w] = (counts[w] || 0) + 1;
  const unique = Object.keys(counts);
  return { counts, unique };
}

function cosineSim(a, b) {
  const allWords = new Set([...a.unique, ...b.unique]);
  let dot = 0, magA = 0, magB = 0;
  for (const w of allWords) {
    const x = a.counts[w] || 0;
    const y = b.counts[w] || 0;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

function averageSimilarity(newText, history) {
  const newVec = vectorize(newText);
  if (!history.length) return 0;
  const sims = history.map(old => cosineSim(vectorize(old), newVec));
  return sims.reduce((a, b) => a + b, 0) / sims.length;
}

export async function scoreIQ(uid, text) {
  if (!uid || !text) return;

  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;

  const data = snap.data();
  let IQ = data.IQ || 0;
  const followers = data.followers || 0;
  const streak = data.streak || 0;

  let score = 0;
  const lower = text.toLowerCase();

  const historyTexts = data.historyTexts || [];
  const historySigs = data.historySigs || [];

  const sig = await textSignature(text);
  const duplicate = historySigs.includes(sig);

  if (
    historySigs.length >= 3 &&
    historySigs.slice(0, 3).every(s => s === sig)
  ) {
    await setDoc(doc(db, "banned", uid), {
      reason: "You were banned by an auto moderation. Our system has detected that you were repeatedly reusing your previous topic on several posts.",
      at: new Date()
    });
    return;
  }

  const newVec = vectorize(text);
  const isSimilar = historyTexts.some(old => cosineSim(vectorize(old), newVec) > 0.9);
  const avgSim = averageSimilarity(text, historyTexts.slice(0, 10));

  if (duplicate) {
    score -= 2;
    console.log("-2 IQ");
  } else if (isSimilar) {
    score -= 1.5;
    console.log("-1.5 IQ");
  } else if (avgSim > 0.9) {
    score -= 1.8;
    console.log("-1.8 IQ");
  } else if (avgSim > 0.75) {
    score -= 1.0;
    console.log("-1 IQ");
  } else {
    score += 0.1;
    console.log("+0.2 IQ");
  }

  const words = lower.split(/\s+/).filter(Boolean);
  const wordCounts = {};
  words.forEach(w => (wordCounts[w] = (wordCounts[w] || 0) + 1));
  const uniqueWords = Object.keys(wordCounts).length;
  const repetitiveWords =
    Object.values(wordCounts).filter(v => v >= 3).length > uniqueWords * 0.3;

  if (repetitiveWords) score -= 0.6;
  else if (uniqueWords > 10) score += 0.06;
  else score += 0.03;

  const repetitiveChars = /(.)\1{4,}/.test(lower);
  if (repetitiveChars) score -= 0.6;
  else if (text.length > 30) score += 0.05;
  else score += 0.025;

  const hashCount = (lower.match(/#/g) || []).length;
  const mentionCount = (lower.match(/@/g) || []).length;
  const badLinks = (lower.match(/https?:\/\/(?!wyntr\.netlify\.app)/g) || []).length;
  const totalSpamTokens = hashCount + mentionCount + badLinks;
  if (totalSpamTokens >= 4) score -= 0.1 * Math.floor(totalSpamTokens / 4);

  if (text.length < 40) score -= 0.08;
  else if (text.length <= 500) score += 0.03 * Math.floor(text.length / 40);
  else score -= 0.1;

  const invisibleChars = text.match(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g) || [];
  const invisibleCount = invisibleChars.length;
  if (invisibleCount > 0) {
    const penalty = invisibleCount * 0.12;
    score -= penalty;
  }

  const IQMultiplier = IQ > 0 ? 1 + Math.min(IQ / 20, 0.5) : 1;
  const followerMultiplier = 1 + Math.min(followers * 0.02, 0.25);
  const streakMultiplier = 1 + Math.min(streak * 0.05, 0.5);
  score *= followerMultiplier * streakMultiplier * IQMultiplier;

  if (score > 0) {
    const dampening = 1 - (IQ / 9) ** 1.5;
    score *= Math.max(dampening, 0.1);
  }

  if (IQ >= 100 && score > 0) score = 0; 

  IQ += score;
  IQ = Math.min(999.999, Math.max(-999.999, parseFloat(IQ.toFixed(2))));

  const newHistoryTexts = [text, ...(data.historyTexts || [])].slice(0, HISTORY_LIMIT);
  const newHistorySigs = [sig, ...(data.historySigs || [])].slice(0, HISTORY_LIMIT);

  await updateDoc(userRef, {
    IQ,
    historyTexts: newHistoryTexts,
    historySigs: newHistorySigs
  });

  console.log(`IQ updated to ${IQ} (${score >= 0 ? "+" : ""}${score.toFixed(2)})`);
  return score.toFixed(2);
}