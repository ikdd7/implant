/*
 * npay.js — 심평원 비급여 포털(hira.or.kr/npay) 구조 정찰(discovery) + (2단계) 수집
 *
 * 1단계(현재): 포털을 열어 검색폼·드롭다운·내부 endpoint(.do/json)를 로그로 덤프.
 *   목적: 의원급 포함 '치과임플란트' 비급여가를 어디서 어떻게 받는지 파악.
 *   실행: node npay.js   (Playwright + Chromium)
 *
 * 로그를 보고 2단계(실제 검색→파싱)를 이 파일에 채웁니다.
 */
const { chromium } = require("playwright");

const ENTRY = process.env.NPAY_URL || "https://www.hira.or.kr/npay/index.do";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", locale: "ko-KR" });
  const page = await ctx.newPage();

  // ── 네트워크 endpoint 수집 ──
  const endpoints = new Set();
  page.on("request", (r) => {
    const u = r.url();
    if (/\.(do|json)(\?|$)/i.test(u) || /npay|nonpay|bilg|bigeup|damt/i.test(u)) {
      endpoints.add(r.method() + " " + u.slice(0, 200));
    }
  });

  console.log("▶ goto", ENTRY);
  try { await page.goto(ENTRY, { waitUntil: "networkidle", timeout: 45000 }); }
  catch (e) { console.warn("goto warn:", e.message); }

  await page.waitForTimeout(2500);
  console.log("최종 URL:", page.url());
  console.log("제목:", await page.title());

  // ── 검색 폼/셀렉트/버튼 덤프 ──
  const info = await page.evaluate(() => {
    const out = { selects: [], buttons: [], forms: [], inputs: [], iframes: [] };
    document.querySelectorAll("select").forEach((s) => {
      out.selects.push({
        id: s.id, name: s.name,
        opts: Array.prototype.slice.call(s.options, 0, 8).map((o) => o.value + ":" + (o.textContent || "").trim()),
      });
    });
    document.querySelectorAll("button, a.btn, input[type=button], input[type=submit], a").forEach((b) => {
      const t = (b.textContent || b.value || "").trim();
      if (/검색|조회|찾기|search/i.test(t) && t.length < 20) out.buttons.push({ tag: b.tagName, t: t, id: b.id, onclick: (b.getAttribute("onclick") || "").slice(0, 80) });
    });
    document.querySelectorAll("form").forEach((f) => out.forms.push({ id: f.id, name: f.name, action: f.action, method: f.method }));
    document.querySelectorAll("input[type=text],input[type=search],input:not([type])").forEach((i) => { if (i.id || i.name) out.inputs.push({ id: i.id, name: i.name, ph: i.placeholder }); });
    document.querySelectorAll("iframe").forEach((f) => out.iframes.push(f.src));
    return out;
  });

  console.log("\n=== SELECTS ===");
  info.selects.forEach((s) => console.log(JSON.stringify(s)));
  console.log("\n=== 검색버튼 ===");
  info.buttons.slice(0, 20).forEach((b) => console.log(JSON.stringify(b)));
  console.log("\n=== FORMS ===");
  info.forms.forEach((f) => console.log(JSON.stringify(f)));
  console.log("\n=== TEXT INPUTS ===");
  info.inputs.slice(0, 20).forEach((i) => console.log(JSON.stringify(i)));
  console.log("\n=== IFRAMES ===");
  info.iframes.forEach((s) => console.log(s));
  console.log("\n=== 네트워크 endpoint(.do/json/npay) ===");
  Array.from(endpoints).slice(0, 40).forEach((e) => console.log(e));

  // 본문 일부(검색 관련 키워드 주변) 덤프
  const html = await page.content();
  const idx = html.search(/임플란트|비급여|시군구|지역선택/);
  console.log("\n=== HTML 일부(키워드 주변) ===");
  console.log(idx >= 0 ? html.slice(Math.max(0, idx - 400), idx + 1200) : html.slice(0, 1500));

  await browser.close();
})();
