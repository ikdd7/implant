/*
 * store.js — clinics.js 읽기/쓰기 공용 모듈 (부작용 없음)
 * 모든 수집기(harvest/hira/scrape/geocode/dedupe)가 이걸 통해 clinics.js를 갱신 →
 * CLINICS + CLINIC_SAMPLE 포맷 일관 유지.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "clinics.js");

function load() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return { clinics: sandbox.window.CLINICS || [], sample: sandbox.window.CLINIC_SAMPLE || [] };
}

function write(all, sample) {
  const header = "/* 인천 연수구 치과(임플란트) 리스트 — 수집+중복병합(" +
    new Date().toISOString().slice(0, 10) + ", " + all.length + "곳) */\n";
  const body = "window.CLINICS = [\n" + all.map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n\n";
  const samp = "/* 실데이터 0건일 때 레이아웃 확인용 예시(클라이언트 폴백). 실제 가격 아님. */\n" +
    "window.CLINIC_SAMPLE = [\n" + (sample || []).map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n";
  fs.writeFileSync(FILE, header + body + samp, "utf8");
}

module.exports = { load, write, FILE };
