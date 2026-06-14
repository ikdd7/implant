/*
 * homepages.js — 각 치과의 홈페이지 URL 수집 (네이버 지역검색 API)
 *   실행:  NAVER_CLIENT_ID=.. NAVER_CLIENT_SECRET=.. node homepages.js
 *   네이버 지역검색 결과의 link(홈페이지)를 이름+주소(연수구)로 매칭해 clinic.homepage 저장.
 *   ONLY_MISSING=0 이면 전체 재조회(기본은 homepage 미확인분만).
 */
const https = require("https");
const store = require("./store.js");
const { nameOverlap } = require("./pricemerge.js");

const CID = process.env.NAVER_CLIENT_ID, CSEC = process.env.NAVER_CLIENT_SECRET;
if (!CID || !CSEC) { console.error("❌ NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요"); process.exit(1); }
const ONLY_MISSING = process.env.ONLY_MISSING !== "0";

function naver(query) {
  return new Promise((res) => {
    https.get({
      host: "openapi.naver.com", path: "/v1/search/local.json?display=5&query=" + encodeURIComponent(query),
      headers: { "X-Naver-Client-Id": CID, "X-Naver-Client-Secret": CSEC, "User-Agent": "Mozilla/5.0" },
    }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { res({ _err: d.slice(0, 120) }); } }); }).on("error", () => res({}));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, "");

(async () => {
  const { clinics, sample } = store.load();
  let checked = 0, found = 0, errLogged = false; const samples = [];
  for (const c of clinics) {
    if (ONLY_MISSING && c.homepage !== undefined) continue;
    checked++;
    const j = await naver("연수구 " + c.name);
    if (j && j._err && !errLogged) { console.warn("네이버 응답 이상:", j._err); errLogged = true; }
    const items = (j && j.items) || [];
    let pick = null;
    for (const it of items) {
      const addr = it.roadAddress || it.address || "";
      if (!/연수구/.test(addr)) continue;
      if (nameOverlap(stripTags(it.title), c.name)) { pick = it; break; }
    }
    const hp = pick && pick.link ? pick.link : "";
    c.homepage = hp || null;
    if (hp) { found++; if (samples.length < 12) samples.push(c.name + " → " + hp); }
    await sleep(120);
  }
  store.write(clinics, sample);
  console.log("✅ 홈페이지 수집(네이버): " + checked + "곳 조회, " + found + "곳 발견");
  samples.forEach((s) => console.log("  " + s));
})();
