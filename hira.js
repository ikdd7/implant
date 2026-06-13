/*
 * hira.js — 심평원(건강보험심사평가원) 비급여진료비정보 OpenAPI에서
 *           연수구 치과의 '치과임플란트(1치당)' 비급여가를 수집 → clinics.js 병합
 *
 * 데이터: 건강보험심사평가원_비급여진료비정보조회서비스 (data.go.kr/data/15001700)
 *   base: http://apis.data.go.kr/B551182/nonPaymentDamtInfoService
 *   op  : getNonPaymentItemHospDtlList (병원별 비급여 항목 상세)
 *
 * 실행:  HIRA_SERVICE_KEY=발급키 node hira.js
 *   - 키 발급: data.go.kr → 위 서비스 활용신청 → 일반 인증키(Decoding)
 *   - (선택) HIRA_SGGU_CD=연수구코드  HIRA_SIDO_CD=인천코드  로 지역 일괄조회
 *     미지정 시: clinics.js의 치과 이름(yadmNm)으로 1곳씩 조회(정밀 매칭)
 *
 * ⚠️ 1회차 실행 시 첫 레코드 원본(raw)을 로그로 출력합니다.
 *    응답의 항목명/가격 필드명이 아래 후보와 다르면 PICK_* 상수만 보정하세요.
 */
const http = require("http");
const https = require("https");
const store = require("./store.js");

const KEY = process.env.HIRA_SERVICE_KEY;
if (!KEY) { console.error("❌ HIRA_SERVICE_KEY 환경변수가 필요합니다 (data.go.kr 인증키)."); process.exit(1); }

const BASE = "apis.data.go.kr";
const OP = "/B551182/nonPaymentDamtInfoService/getNonPaymentItemHospDtlList";

// 응답 필드 후보(스펙이 인증 뒤라 1회차 raw 확인 후 보정 가능)
const NAME_KEYS = ["npayKorNm", "itemNm", "npayNm", "curMcd", "npayKor"];   // 항목명
const AMT_KEYS = ["curAmt", "cntrAmt", "amt", "maxPrc", "minPrc", "npayAmt"]; // 금액(원)
const YADM_KEYS = ["yadmNm", "hospNm", "yadmnm"];                            // 병원명
const ADDR_KEYS = ["adr", "yadmAdr", "addr", "siDoNm"];                      // 주소

const get = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== "") return o[k]; return null; };
const isImplant = (nm) => /임플란트|임프란트|implant/i.test(String(nm || ""));

function reqJSON(url) {
  const lib = url.startsWith("https") ? https : http;
  return new Promise((res, rej) => {
    lib.get(url, (r) => {
      let d = ""; r.on("data", (c) => (d += c));
      r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(new Error("JSON 파싱 실패: " + d.slice(0, 200))); } });
    }).on("error", rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

function buildUrl(params) {
  const qs = Object.keys(params).filter((k) => params[k] != null && params[k] !== "")
    .map((k) => k + "=" + enc(params[k])).join("&");
  // serviceKey는 이미 인코딩된 키일 수 있어 그대로 부착
  return "http://" + BASE + OP + "?serviceKey=" + KEY + "&" + qs;
}

async function fetchRows(extra) {
  const rows = [];
  let logged = false;
  for (let page = 1; page <= 50; page++) {
    const url = buildUrl(Object.assign({ pageNo: page, numOfRows: 100, _type: "json" }, extra));
    let j;
    try { j = await reqJSON(url); } catch (e) { console.warn("  요청 실패:", e.message); break; }
    const body = j && j.response && j.response.body;
    let items = body && body.items;
    if (items && items.item) items = items.item;
    if (!items) { // 에러 메시지 노출
      const h = j && j.response && j.response.header;
      if (h && h.resultCode && h.resultCode !== "00") console.warn("  API:", h.resultCode, h.resultMsg);
      break;
    }
    const arr = Array.isArray(items) ? items : [items];
    if (!logged && arr.length) { console.log("  [raw 첫 레코드]", JSON.stringify(arr[0])); logged = true; }
    arr.forEach((it) => rows.push(it));
    const total = (body && +body.totalCount) || 0;
    if (page * 100 >= total || arr.length < 100) break;
    await sleep(120);
  }
  return rows;
}

(async () => {
  const { clinics, sample } = store.load();
  const { applyScrape } = require("./pricemerge.js");

  const SIDO = process.env.HIRA_SIDO_CD, SGGU = process.env.HIRA_SGGU_CD;
  let raw = [];

  if (SGGU || SIDO) {
    console.log("지역코드 조회: sido=" + (SIDO || "-") + " sggu=" + (SGGU || "-"));
    raw = await fetchRows({ sidoCd: SIDO, sgguCd: SGGU });
  } else {
    console.log("치과 이름(yadmNm)으로 1곳씩 조회: " + clinics.length + "곳");
    for (const c of clinics) {
      const rows = await fetchRows({ yadmNm: c.name });
      raw = raw.concat(rows);
      await sleep(100);
    }
  }

  // 임플란트 항목만, 연수구만
  const impl = raw.filter((it) => isImplant(get(it, NAME_KEYS)) &&
    /연수구/.test(String(get(it, ADDR_KEYS) || "")) !== false); // 주소 필드 없으면 통과
  console.log("임플란트 비급여 레코드: " + impl.length + "건 / 전체 " + raw.length + "건");

  const stat = { filled: 0, averaged: 0, dup: 0, inserted: 0, ambiguous: 0, junk: 0, invalid: 0 };
  impl.forEach((it) => {
    const price = parseInt(String(get(it, AMT_KEYS) || "").replace(/[^0-9]/g, ""), 10);
    const name = get(it, YADM_KEYS);
    if (!name || !price) return;
    const r = applyScrape(clinics, {
      name: name, region: "인천", district: "연수구", price: price,
      addr: get(it, ADDR_KEYS) || undefined,
      source: "hira/" + name,
    });
    stat[r.status] = (stat[r.status] || 0) + 1;
  });

  store.write(require("./dedupe.js").dedupeClinics(clinics), sample);
  console.log("✅ 심평원 임플란트가 반영:", JSON.stringify(stat));
})();
