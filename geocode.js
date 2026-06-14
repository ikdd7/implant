/*
 * geocode.js — clinics.js의 좌표(lat/lng)를 카카오 지도 API로 정밀 갱신
 *
 * 사용법:  KAKAO_REST_KEY=발급키 node geocode.js
 *   ONLY_MISSING=1 → 좌표 없는 치과(수집 신규삽입분)만 지오코딩(호출 절약)
 *
 * 동작: 각 치과를 "치과명 + 연수구"로 카카오 키워드 검색 → 첫 결과 좌표로 갱신.
 *       못 찾으면 기존값 유지. 무료 한도(일 30만) 내 충분.
 */
const https = require("https");
const store = require("./store.js");

const KEY = process.env.KAKAO_REST_KEY;
if (!KEY) { console.error("❌ 환경변수 KAKAO_REST_KEY 가 필요합니다."); process.exit(1); }

const { clinics, sample } = store.load();

function req(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { Authorization: "KakaoAK " + KEY } }, (r) => {
      let d = ""; r.on("data", (c) => (d += c));
      r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on("error", rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

(async () => {
  const ONLY_MISSING = !!process.env.ONLY_MISSING;
  const targets = ONLY_MISSING ? clinics.filter((v) => !(v.lat && v.lng)) : clinics;
  console.log((ONLY_MISSING ? "좌표 없는 " : "전체 ") + targets.length + "곳 지오코딩 시작");
  let updated = 0; const failed = [];
  for (const v of targets) {
    const q = (v.name + " 연수구").trim();
    let hit = null;
    try {
      let j = await req("https://dapi.kakao.com/v2/local/search/keyword.json?size=1&query=" + enc(q));
      if (j.documents && j.documents.length) hit = j.documents[0];
    } catch (e) { /* 폴백 */ }
    if (hit) {
      const lat = +hit.y, lng = +hit.x;
      if (lat >= 37 && lat <= 37.6 && lng >= 126.5 && lng <= 126.8) {
        v.lat = +lat.toFixed(6); v.lng = +lng.toFixed(6); updated++;
      } else failed.push(v.name);
    } else failed.push(v.name);
    await sleep(200);
  }

  store.write(clinics, sample);
  console.log("✅ 좌표 갱신: " + updated + " / " + clinics.length + "곳");
  if (failed.length) console.log("⚠️ 못 찾음(기존 유지): " + failed.join(", "));
})();
