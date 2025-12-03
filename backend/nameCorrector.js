// backend/nameCorrector.js
const indianNames = [
  "Umer","Umair","Omar","Aamir","Amir","Sameer","Samir","Imran","Armaan",
  "Chandrakant","Chandrashekhar","Aditya","Rohit","Karan","Kartik",
  "Suresh","Ganesh","Vikram","Prakash","Gaurav","Ravi",
  "Patel","Khan","Shaikh","Joshi","Nair","Yadav","Reddy","Shetty","Gowda"
];

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function fixNameSegment(segment) {
  const words = segment.split(" ").filter(Boolean);

  return words
    .map((word) => {
      let best = word;
      let minDist = Infinity;

      for (const name of indianNames) {
        const dist = levenshtein(word.toLowerCase(), name.toLowerCase());
        if (dist < minDist && dist <= 2) {
          minDist = dist;
          best = name;
        }
      }
      return best;
    })
    .join(" ");
}

function correctNames(text) {
  const lowered = (text || "").toLowerCase();

  // Identify simple name-intro patterns
  let marker = null;
  if (lowered.includes("my name is")) marker = "my name is";
  else if (lowered.includes("i am")) marker = "i am";
  else if (lowered.includes("this is")) marker = "this is";
  else if (lowered.includes("call me")) marker = "call me";
  else return text || "";

  const idx = lowered.indexOf(marker);
  const before = (text || "").slice(0, idx + marker.length);
  const after = (text || "").slice(idx + marker.length).trim();

  const rawName = (after.split(/[.,!?]/)[0] || "").trim();
  if (!rawName) return text || "";

  const fixedName = fixNameSegment(rawName);
  return before + " " + fixedName + (after.slice(rawName.length) || "");
}

module.exports = correctNames;
