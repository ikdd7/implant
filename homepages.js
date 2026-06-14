/*
 * homepages.js — 각 치과의 홈페이지 URL 자동 수집 (카카오 장소 상세)
 *   카카오 키워드검색으로 place id 확보 → place.map.kakao.com 상세에서 homepage 추출 → clinics.js에 homepage 필드 저장.
 *   실행:  KAKAO_REST_KEY=키 node homepages.js
 *   결과:  clinic.homepage = "https://..."(있으면) / null(없음). scrape-clinic.js(C2)가 이걸로 수가표를 긁음.
 */
const https = require("https");
const store = require("./store.js");

const KEY = process.env.KAKAO_REST_KEY;
if (!KEY) { console.error("❌ KAKAO_REST_KEY 필요"); process.exit(1); }
const ONLY_MISSING = process.env.ONLY_MISSING !== "0"; // 기본: homepage 미확인분만

function getJSON(host, path, headers) {
  return new Promise((res) => {
    https.get({ host, path, headers }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(d)); }).on("error", () => res(""));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

// 카카오 키워드검색 → place id
async function placeId(name) {
  const d = await getJSON("dapi.kakao.com", "/v2/local/search/keyword.json?size=1&query=" + enc(name + " 연수구 치과"), { Authorization: "KakaoAK " + KEY });
  try { const j = JSON.parse(d); return (j.documents && j.documents[0] && j.documents[0].id) || null; } catch (e) { return null; }
}
// 카카오 장소 상세 → homepage
async function homepageOf(id) {
  const d = await getJSON("place.map.kakao.com", "/main/v/" + id, { "User-Agent": "Mozilla/5.0", Referer: "https://place.map.kakao.com/" });
  let m = d.match(/"homepage"\s*:\s*"([^"]*)"/);
  let hp = m ? m[1] : "";
  hp = hp.replace(/\\\//g, "/").trim();
  return /^https?:\/\//.test(hp) ? hp : "";
}

(async () => {
  const { clinics, sample } = store.load();
  let checked = 0, found = 0; const samples = [];
  for (const c of clinics) {
    if (ONLY_MISSING && c.homepage !== undefined) continue;
    let id = null;
    const m = String(c.source || "").match(/kakao\/(\d+)/) || String(c.priceSources || "").match(/kakao\/(\d+)/);
    if (m) id = m[1]; else id = await placeId(c.name);
    if (!id) { c.homepage = null; continue; }
    const hp = await homepageOf(id);
    c.homepage = hp || null;
    checked++;
    if (hp) { found++; if (samples.length < 10) samples.push(c.name + " → " + hp); }
    await sleep(200);
  }
  store.write(clinics, sample);
  console.log("✅ 홈페이지 수집: " + checked + "곳 확인, " + found + "곳 발견");
  samples.forEach((s) => console.log("  " + s));
})();
