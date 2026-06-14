/*
 * harvest.js — 카카오 장소검색으로 인천 연수구 치과 수확 → clinics.js 병합
 *
 * 실행:  KAKAO_REST_KEY=발급키 node harvest.js
 * (또는 GitHub Actions "Harvest clinics" 워크플로로 실행)
 *
 * 동작:
 *  - "인천 연수구 {동} 치과/임플란트치과" 키워드 검색(페이지당 15 × 3페이지)
 *  - 치과 카테고리만 필터 → 중복 제거(카카오 place id + 이름 정규화)
 *  - 기존 clinics.js와 병합: 기존 항목(가격 보유)은 유지, 새 치과는 price:null로 추가
 *  - 좌표는 카카오 제공값(정확) 사용
 */
const https = require("https");
const store = require("./store.js");

const KEY = process.env.KAKAO_REST_KEY;
if (!KEY) { console.error("❌ KAKAO_REST_KEY 환경변수가 필요합니다."); process.exit(1); }

// 연수구 법정/행정동 — 커버리지 보강용 검색 시드
const DONGS = ["", "송도동", "연수동", "동춘동", "청학동", "옥련동", "선학동", "연수구청", "송도국제도시", "캠퍼스타운역", "센트럴파크역"];
const KEYWORDS = ["치과", "임플란트치과", "임플란트"];

const norm = (s) => String(s || "").replace(/[\s()\-·_]/g, "").toLowerCase();
function isDental(d) {
  return /치과/.test(d.category_name || "") || /치과/.test(d.place_name || "");
}
function inYeonsu(addr) {
  return /연수구/.test(addr || "");
}

function req(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { Authorization: "KakaoAK " + KEY, KA: "sdk/1.0.0 os/linux lang/ko-KR origin/https://ikdd7.github.io" } }, (r) => {
      let d = ""; r.on("data", (c) => (d += c));
      r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on("error", rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { clinics: existing, sample } = store.load();
  const seen = new Set(existing.map((v) => norm(v.name)));
  const byId = new Set();
  const added = [];
  let calls = 0;
  let loggedErr = false;

  for (const dong of DONGS) {
    for (const kw of KEYWORDS) {
      const q = ("인천 연수구 " + dong + " " + kw).replace(/\s+/g, " ").trim();
      for (let page = 1; page <= 3; page++) {
        let j;
        try {
          j = await req("https://dapi.kakao.com/v2/local/search/keyword.json?size=15&page=" + page +
            "&query=" + encodeURIComponent(q));
          calls++;
        } catch (e) { break; }
        if (!j || !j.documents) {
          if (!loggedErr) { console.warn("⚠️ 카카오 비정상 응답:", JSON.stringify(j).slice(0, 300)); loggedErr = true; }
        }
        const docs = (j && j.documents) || [];
        for (const d of docs) {
          if (!isDental(d)) continue;
          const addr = d.address_name || d.road_address_name || "";
          if (!inYeonsu(addr)) continue;
          if (byId.has(d.id) || seen.has(norm(d.place_name))) continue;
          const lat = +(+d.y).toFixed(6), lng = +(+d.x).toFixed(6);
          if (!(lat >= 37 && lat <= 37.6 && lng >= 126.5 && lng <= 126.8)) continue; // 연수구 대략 범위
          byId.add(d.id); seen.add(norm(d.place_name));
          added.push({
            name: d.place_name, region: "인천", district: "연수구",
            price: null, lat: lat, lng: lng, verified: false,
            source: "kakao/" + d.id,
            addr: (d.road_address_name || d.address_name || "") || undefined,
            phone: d.phone || undefined,
          });
        }
        if (!j || !j.meta || j.meta.is_end) break;
        await sleep(120);
      }
    }
  }

  const { dedupeClinics } = require("./dedupe.js");
  const all = dedupeClinics(existing.concat(added));
  store.write(all, sample);

  console.log("✅ 신규 " + added.length + "곳 추가 (API 호출 " + calls + "회) → 총 " + all.length + "곳");
})();
