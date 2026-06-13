/*
 * test.js — 데이터·로직 검증 (의존성 0). 실행: node test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }

// 모듈 로드
const Stats = require("./stats.js").Stats;
const { dedupeClinics, isJunk } = require("./dedupe.js");
const { applyScrape, matchClinic } = require("./pricemerge.js");
const SLUGS = require("./regions.js").DISTRICT_SLUGS;

// clinics.js 로드
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "clinics.js"), "utf8"), sandbox);
const CLINICS = sandbox.window.CLINICS || [];
const SAMPLE = sandbox.window.CLINIC_SAMPLE || [];

// 1. 통계
ok(Stats.median([1, 2, 3]) === 2, "median 홀수");
ok(Stats.median([1, 2, 3, 4]) === 2.5, "median 짝수");
ok(Stats.robust([100, 100, 100, 100, 9999999]).dropped >= 1, "robust 이상치 제외");
ok(Stats.percentileBelow([100, 200, 300], 200) === 50, "percentile 중앙");
ok(Stats.plausible({ price: 1500000 }) === true, "plausible 정상가");
ok(Stats.plausible({ price: 5000 }) === false, "plausible 단위실수 컷");

// 2. 슬러그
ok(SLUGS["연수구"] === "yeonsu", "연수구 슬러그");

// 3. dedupe
ok(isJunk("○○치과기공소") === true, "기공소 잡음 컷");
ok(isJunk("연수서울치과의원") === false, "치과의원 보존");
(function () {
  const a = [
    { name: "A치과", district: "연수구", price: 1000000, lat: 37.41, lng: 126.67, verified: false, source: "x" },
    { name: "A치과", district: "연수구", price: null, lat: 37.41001, lng: 126.67001, verified: false, source: "y" },
  ];
  const out = dedupeClinics(a);
  ok(out.length === 1, "근접 동명 병합");
})();

// 4. pricemerge
(function () {
  const list = [{ name: "굿모닝치과", district: "연수구", price: null, verified: false, source: "kakao/1" }];
  let r = applyScrape(list, { name: "굿모닝치과", district: "연수구", price: 1200000, source: "hira/굿모닝치과" });
  ok(r.status === "filled" && list[0].price === 1200000, "최초 가격 채움");
  r = applyScrape(list, { name: "굿모닝치과", district: "연수구", price: 1400000, source: "site/url" });
  ok(r.status === "averaged" && list[0].price === 1300000, "다른 소스 평균");
  r = applyScrape(list, { name: "굿모닝치과", district: "연수구", price: 1400000, source: "site/url" });
  ok(r.status === "dup", "같은 소스 스킵");
  r = applyScrape(list, { name: "새이름치과", district: "연수구", price: 1100000, source: "hira/새이름치과" });
  ok(r.status === "inserted" && list.length === 2, "신규 삽입");
  ok(matchClinic({ name: "굿모닝치과", district: "연수구" }, { name: "굿모닝치과" }) === true, "이름 완전일치 매칭");
})();

// 5. 데이터 무결성 (실데이터가 있으면)
CLINICS.forEach((c, i) => {
  ok(c.name && c.district === "연수구", "clinic#" + i + " 이름/구");
  if (c.price != null) ok(Stats.plausible(c), "clinic#" + i + " 가격 상식범위: " + c.name);
});
ok(SAMPLE.length >= 1, "샘플 폴백 존재");

console.log("\n" + (fail ? "❌" : "✅") + " 통과 " + pass + " / 실패 " + fail);
process.exit(fail ? 1 : 0);
