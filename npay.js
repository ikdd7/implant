/*
 * npay.js — 심평원 비급여 포털(hira.or.kr/npay) "비급여 진료비용" 검색 결과 수집
 *   대상: 인천 연수구(sidoCd=22, sgguCd=220007) 치과임플란트(의원급 포함)
 *   방식: index.do로 세션/CSRF 확보 → selectNpayDamtPubList.do POST 페이징 → JSON 파싱
 *         → 의료기관명으로 clinics.js 매칭, 1치당 가격(레코드 금액들의 중앙값) 반영
 *   실행: node npay.js     (Node 표준 https만, 의존성 0)
 *
 * ⚠️ 1회차: 응답 첫 레코드 raw + 키 목록을 로그로 출력 → 금액/이름 필드명이 다르면 PICK_* 보정.
 */
const https = require("https");
const store = require("./store.js");
const { applyScrape } = require("./pricemerge.js");

const HOST = "www.hira.or.kr";
const LIST_PATH = "/npay/rb/selectNpayDamtPubList.do";
const NPAY_CDS = "1180Z,1180Z010,UB0010011,UB0010021,UB0010012,UB0010022,UB0010041,UB0010051,UB0010001";
const SIDO = process.env.NPAY_SIDO || "22";       // 인천
const SGGU = process.env.NPAY_SGGU || "220007";   // 연수구
const SIDO_NM = process.env.NPAY_SIDO_NM || "인천";
const SGGU_NM = process.env.NPAY_SGGU_NM || "인천연수구";

// 응답 필드 후보(1회차 raw 확인 후 보정 가능)
const NAME_KEYS = ["yadmNm", "yadmnm", "hospNm"];                 // 의료기관명
const AMT_KEYS = ["minAmt", "maxAmt", "minPrc", "maxPrc", "curAmt", "amt", "prc", "npayAmt", "cmpAmt"]; // 금액(원)
const ITEM_KEYS = ["npayKorNm", "npayNm", "itemNm"];             // 항목명
const PRICE_MIN = 300000, PRICE_MAX = 6000000;

function req(method, path, headers, body) {
  return new Promise((res, rej) => {
    const r = https.request({ host: HOST, path: path, method: method, headers: headers }, (resp) => {
      let d = "";
      resp.on("data", (c) => (d += c));
      resp.on("end", () => res({ status: resp.statusCode, headers: resp.headers, body: d }));
    });
    r.on("error", rej);
    if (body) r.write(body);
    r.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

// set-cookie 배열 → "k=v; k=v" + 특정 쿠키 추출
function parseCookies(setCookie) {
  const jar = {};
  (setCookie || []).forEach((line) => {
    const kv = line.split(";")[0];
    const i = kv.indexOf("=");
    if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  return jar;
}

function buildBody(csrf, page) {
  // 캡처한 요청 순서/키 그대로 재현 (Cleopatra dmParam 포맷)
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
// 객체 안에서 yadmNm을 가진 레코드 배열을 찾아 반환
function findRows(j) {
  let best = [];
  (function walk(v) {
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === "object" && v[0] && NAME_KEYS.some((k) => k in v[0])) {
        if (v.length > best.length) best = v;
      }
      v.forEach(walk);
    } else if (v && typeof v === "object") { Object.keys(v).forEach((k) => walk(v[k])); }
  })(j);
  return best;
}

(async () => {
  // 1) 세션/CSRF 확보
  const home = await req("GET", "/npay/index.do", {
    "User-Agent": "Mozilla/5.0", "Accept": "text/html",
  });
  const jar = parseCookies(home.headers["set-cookie"]);
  console.log("쿠키:", Object.keys(jar).join(", ") || "(없음)");
  const cookieHeader = Object.keys(jar).map((k) => k + "=" + jar[k]).join("; ");
  const csrfRaw = jar.CSRF_TOKEN || "";
  const csrf = csrfRaw ? decodeURIComponent(csrfRaw) : "";
  if (!csrf) console.warn("⚠️ CSRF_TOKEN 쿠키를 못 받음 — POST가 거부될 수 있음");

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://www.hira.or.kr",
    "Referer": "https://www.hira.or.kr/npay/index.do",
    "User-Agent": "Mozilla/5.0",
    "Cookie": cookieHeader,
  };

  // 2) 페이징 수집
  let raw = [], logged = false;
  for (let page = 1; page <= 30; page++) {
    const body = buildBody(csrf, page);
    const h = Object.assign({}, headers, { "Content-Length": Buffer.byteLength(body) });
    let resp;
    try { resp = await req("POST", LIST_PATH, h, body); } catch (e) { console.warn("요청 실패 p" + page, e.message); break; }
    let j; try { j = JSON.parse(resp.body); } catch (e) { console.warn("JSON 파싱 실패 p" + page + " (status " + resp.status + "):", resp.body.slice(0, 200)); break; }
    const rows = findRows(j);
    if (!logged) {
      console.log("응답 최상위 키:", Object.keys(j).join(", "));
      if (rows[0]) { console.log("[raw 첫 레코드]", JSON.stringify(rows[0])); console.log("레코드 키:", Object.keys(rows[0]).join(", ")); }
      logged = true;
    }
    if (!rows.length) { console.log("p" + page + ": 행 없음 → 종료"); break; }
    raw = raw.concat(rows);
    if (rows.length < 100) break;
    await sleep(300);
  }
  console.log("총 수집 레코드:", raw.length);

  // 3) 의료기관별 금액 모으기 → 중앙값
  function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
  const byName = {};
  raw.forEach((it) => {
    const nm = get(it, NAME_KEYS); if (!nm) return;
    const amts = [];
    AMT_KEYS.forEach((k) => { const n = parseInt(String(it[k] == null ? "" : it[k]).replace(/[^0-9]/g, ""), 10); if (n >= PRICE_MIN && n <= PRICE_MAX) amts.push(n); });
    if (!amts.length) return;
    (byName[nm] = byName[nm] || []).push.apply(byName[nm], amts);
  });
  const names = Object.keys(byName);
  console.log("가격 있는 의료기관:", names.length);

  // 4) clinics.js 반영
  const { clinics, sample } = store.load();
  const stat = { filled: 0, averaged: 0, dup: 0, inserted: 0, ambiguous: 0, junk: 0, invalid: 0 };
  names.forEach((nm) => {
    const price = median(byName[nm]);
    const r = applyScrape(clinics, { name: nm, region: "인천", district: "연수구", price: price, source: "npay/" + nm });
    stat[r.status] = (stat[r.status] || 0) + 1;
  });
  store.write(require("./dedupe.js").dedupeClinics(clinics), sample);
  console.log("✅ 비급여 포털 반영:", JSON.stringify(stat));
})();
