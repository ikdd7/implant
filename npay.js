/*
 * npay.js — 심평원 비급여 포털 "비급여 진료비용" 결과 수집 (Playwright 인-페이지 fetch)
 *   포털 SPA를 띄워 세션/CSRF를 자동 확립한 뒤, 페이지 컨텍스트에서 직접 API 호출.
 *   대상: 인천 연수구(sidoCd=22, sgguCd=220007) 치과임플란트(의원급 포함)
 *   실행: node npay.js   (Playwright + Chromium)
 */
const { chromium } = require("playwright");
const store = require("./store.js");
const { applyScrape } = require("./pricemerge.js");

const ENTRY = "https://www.hira.or.kr/npay/index.do";
const LIST_PATH = "/npay/rb/selectNpayDamtPubList.do";
const NPAY_CDS = "1180Z,1180Z010,UB0010011,UB0010021,UB0010012,UB0010022,UB0010041,UB0010051,UB0010001";
const SIDO = process.env.NPAY_SIDO || "22";
const SGGU = process.env.NPAY_SGGU || "220007";
const SIDO_NM = process.env.NPAY_SIDO_NM || "인천";
const SGGU_NM = process.env.NPAY_SGGU_NM || "인천연수구";

const NAME_KEYS = ["yadmNm", "yadmnm", "hospNm"];
const AMT_KEYS = ["minAmt", "maxAmt", "minPrc", "maxPrc", "curAmt", "amt", "prc", "npayAmt", "cmpAmt"];
const PRICE_MIN = 300000, PRICE_MAX = 6000000;
const enc = encodeURIComponent;

function buildBody(csrf, page) {
  const pairs = [
    ["_csrf", csrf],
    ["@d1#sidoCd", SIDO], ["@d1#sgguCd", SGGU], ["@d1#emdongCd", ""],
    ["@d1#sidoNm", SIDO_NM], ["@d1#sgguNm", SGGU_NM], ["@d1#emdongNm", ""],
    ["@d1#clCd", ""], ["@d1#yadmNm", ""], ["@d1#npayCdNm", "임플란트"],
    ["@d1#npayCds", NPAY_CDS], ["@d1#npayLdivCd", ""], ["@d1#ykiho", ""],
    ["@d1#totalRowCount", "0"], ["@d1#pageRowCount", "100"], ["@d1#viewPageCount", "5"],
    ["@d1#currentPageIndex", String(page)], ["@d1#sortOrd", ""], ["@d1#npayCd", ""],
    ["@d1#xPos", "126.6782"], ["@d1#yPos", "37.4106"], ["@d1#isDev", "N"],
    ["@d1#schType", "npay"], ["@d1#schDtlTxt", ""],
    ["@d#", "@d1#"], ["@d1#", "dmParam"], ["@d1#tp", "dm"],
  ];
  return pairs.map(([k, v]) => enc(k) + "=" + enc(v)).join("&");
}

const get = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== "") return o[k]; return null; };
function findRows(j) {
  let best = [];
  (function walk(v) {
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === "object" && v[0] && NAME_KEYS.some((k) => k in v[0])) { if (v.length > best.length) best = v; }
      v.forEach(walk);
    } else if (v && typeof v === "object") { Object.keys(v).forEach((k) => walk(v[k])); }
  })(j);
  return best;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: "ko-KR", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" });
  const page = await ctx.newPage();
  console.log("▶ goto", ENTRY);
  await page.goto(ENTRY, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => console.warn("goto warn:", e.message));
  await page.waitForTimeout(5000); // SPA 초기화 → CSRF/세션 확립

  // CSRF 토큰: 쿠키(document.cookie) 또는 framework 전역에서 탐색
  const csrf = await page.evaluate(() => {
    const m = document.cookie.match(/CSRF_TOKEN=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
    try { for (const k in window) { const v = window[k]; if (typeof v === "string" && /^[A-Za-z0-9+/=]{20,}$/.test(v) && k.toLowerCase().indexOf("csrf") >= 0) return v; } } catch (e) {}
    return "";
  });
  console.log("CSRF:", csrf ? csrf.slice(0, 12) + "…" : "(못 구함)");
  console.log("cookie names:", await page.evaluate(() => document.cookie.split(";").map((c) => c.trim().split("=")[0]).join(",")));

  // 인-페이지 fetch로 페이징 수집
  let raw = [], logged = false;
  for (let pg = 1; pg <= 30; pg++) {
    const body = buildBody(csrf, pg);
    const res = await page.evaluate(async (args) => {
      const r = await fetch(args.path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" }, body: args.body, credentials: "include" });
      return { status: r.status, text: await r.text() };
    }, { path: LIST_PATH, body: body });
    let j; try { j = JSON.parse(res.text); } catch (e) { console.warn("JSON 실패 p" + pg + " status " + res.status + ":", res.text.slice(0, 200)); break; }
    const rows = findRows(j);
    if (!logged) {
      console.log("응답 최상위 키:", Object.keys(j).join(", "));
      if (j.ERRMSGINFO) console.log("에러 응답:", JSON.stringify(j).slice(0, 300));
      if (rows[0]) { console.log("[raw 첫 레코드]", JSON.stringify(rows[0])); console.log("레코드 키:", Object.keys(rows[0]).join(", ")); }
      logged = true;
    }
    if (!rows.length) { console.log("p" + pg + ": 행 없음 → 종료"); break; }
    raw = raw.concat(rows);
    if (rows.length < 100) break;
    await page.waitForTimeout(300);
  }
  await browser.close();
  console.log("총 수집 레코드:", raw.length);

  function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
  const byName = {};
  raw.forEach((it) => {
    const nm = get(it, NAME_KEYS); if (!nm) return;
    const amts = [];
    AMT_KEYS.forEach((k) => { const n = parseInt(String(it[k] == null ? "" : it[k]).replace(/[^0-9]/g, ""), 10); if (n >= PRICE_MIN && n <= PRICE_MAX) amts.push(n); });
    if (amts.length) (byName[nm] = byName[nm] || []).push.apply(byName[nm], amts);
  });
  const names = Object.keys(byName);
  console.log("가격 있는 의료기관:", names.length);

  const { clinics, sample } = store.load();
  const stat = { filled: 0, averaged: 0, dup: 0, inserted: 0, ambiguous: 0, junk: 0, invalid: 0 };
  names.forEach((nm) => {
    const r = applyScrape(clinics, { name: nm, region: "인천", district: "연수구", price: median(byName[nm]), source: "npay/" + nm });
    stat[r.status] = (stat[r.status] || 0) + 1;
  });
  store.write(require("./dedupe.js").dedupeClinics(clinics), sample);
  console.log("✅ 비급여 포털 반영:", JSON.stringify(stat));
})();
