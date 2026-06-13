/*
 * scrape-clinic.js — 치과 '홈페이지에 게시된' 임플란트 비급여가 best-effort 수집
 *
 * 실행:  node scrape-clinic.js   (Playwright + Chromium 필요)
 * 입력:  clinic-sites.js (운영자가 채운 {name,url[,price]} 목록)
 * 출력:  clinics.js 갱신 (소스가 다르면 평균, 같으면 스킵)
 *
 * 동작:
 *  - 각 url 렌더 → 본문 텍스트에서 '임플란트' 주변의 금액(만원/원)을 추출
 *  - 1치당 상식 범위(stats.PRICE_MIN~MAX) 밖이면 버림(이벤트가·총액 오인 방지)
 *  - price를 사이트목록에 직접 적었으면 그 값을 우선 사용(스크랩 생략)
 * ⚠️ 게시 여부·정확도는 사이트마다 달라 '검증 전(verified:false)'으로만 들어갑니다.
 */
const store = require("./store.js");
const SITES = require("./clinic-sites.js");
const { applyScrape } = require("./pricemerge.js");
const PRICE_MIN = 300000, PRICE_MAX = 6000000;

// 텍스트에서 '임플란트' 근처 금액 추출 → 1치당 가격 후보
function extractImplantPrice(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ");
  const cands = [];
  const re = /임플란트[^.|\n]{0,40}?([0-9][0-9,]{2,})\s*(만원|만|원)/g;
  let m;
  while ((m = re.exec(t))) {
    let n = parseInt(m[1].replace(/,/g, ""), 10);
    if (/만/.test(m[2])) n *= 10000;
    if (n >= PRICE_MIN && n <= PRICE_MAX) cands.push(n);
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a - b);
  return cands[Math.floor(cands.length / 2)]; // 중앙값(이벤트 최저가/총액 극단 완화)
}

(async () => {
  if (!SITES.length) { console.log("clinic-sites.js가 비어있습니다. 대상 치과 홈페이지를 등록하세요."); return; }
  const { clinics, sample } = store.load();

  let browser = null;
  const needBrowser = SITES.some((s) => !s.price);
  if (needBrowser) {
    const { chromium } = require("playwright");
    browser = await chromium.launch();
  }
  const stat = { filled: 0, averaged: 0, dup: 0, inserted: 0, ambiguous: 0, junk: 0, invalid: 0, nomatch: 0 };

  for (const s of SITES) {
    let price = s.price || null;
    if (!price && browser) {
      try {
        const page = await browser.newPage();
        await page.goto(s.url, { waitUntil: "networkidle", timeout: 30000 });
        const text = await page.evaluate(() => document.body.innerText);
        await page.close();
        price = extractImplantPrice(text);
      } catch (e) { console.warn("  렌더 실패:", s.name, e.message); }
    }
    if (!price) { console.log("  가격 못 찾음:", s.name); stat.nomatch++; continue; }
    const r = applyScrape(clinics, {
      name: s.name, region: "인천", district: "연수구", price: price,
      source: s.source || ("site/" + (s.url || s.name)),
    });
    stat[r.status] = (stat[r.status] || 0) + 1;
    console.log("  " + s.name + ": " + price.toLocaleString("ko-KR") + "원 → " + r.status);
  }
  if (browser) await browser.close();

  store.write(require("./dedupe.js").dedupeClinics(clinics), sample);
  console.log("✅ 홈페이지 게시가 반영:", JSON.stringify(stat));
})();
