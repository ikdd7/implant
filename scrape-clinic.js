/*
 * scrape-clinic.js — 치과 홈페이지의 임플란트 비급여가(수가표) 수집 → 있으면 가격 덮어쓰기
 *   대상: clinics.js 에서 homepage 가 있는 치과 (homepages.js로 채움)
 *   방법: 홈페이지 + 비급여/수가/가격 하위페이지를 렌더 →
 *         ① HTML 텍스트  ② PDF(텍스트→없으면 OCR)  ③ 이미지(OCR) 에서 "임플란트 + 금액" 추출
 *   결과: 찾으면 price/priceMin/priceMax 덮어쓰기, source=site/<host>, 수가표 링크(priceUrl) 저장.
 *   실행: node scrape-clinic.js   (Playwright + poppler-utils + tesseract-ocr[-kor] 필요)
 *   옵션: SCRAPE_LIMIT=동시처리수(기본 전체), SCRAPE_ONLY="치과명" (특정 1곳 테스트)
 */
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const https = require("https"), http = require("http");
const store = require("./store.js");

const PRICE_MIN = 300000, PRICE_MAX = 6000000;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "hp-"));

// ── 텍스트에서 임플란트 금액 추출 ──
function wonOf(numStr, unit) { let n = parseInt(String(numStr).replace(/,/g, ""), 10); if (/만/.test(unit)) n *= 10000; return n; }
function extractImplant(text) {
  if (!text) return [];
  const t = String(text).replace(/[\n\r\t]+/g, " ").replace(/ +/g, " ");
  const out = [];
  const re = /임[\s]?플[\s]?란[\s]?트[^.]{0,50}?([0-9][0-9,]{1,})\s*(만원|만|원)/g;
  let m; while ((m = re.exec(t))) { const n = wonOf(m[1], m[2]); if (n >= PRICE_MIN && n <= PRICE_MAX) out.push(n); }
  return out;
}
function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }

// ── 파일 다운로드(리다이렉트 1회, 8MB 제한) ──
function download(url, dest) {
  return new Promise((res) => {
    try {
      const lib = url.startsWith("https") ? https : http;
      const r = lib.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 20000 }, (resp) => {
        if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) { resp.destroy(); return res(download(new URL(resp.headers.location, url).href, dest)); }
        if (resp.statusCode !== 200) { resp.destroy(); return res(false); }
        const f = fs.createWriteStream(dest); let size = 0;
        resp.on("data", (c) => { size += c.length; if (size > 8e6) { resp.destroy(); f.destroy(); res(false); } });
        resp.pipe(f); f.on("finish", () => f.close(() => res(true))); f.on("error", () => res(false));
      });
      r.on("error", () => res(false)); r.on("timeout", () => { r.destroy(); res(false); });
    } catch (e) { res(false); }
  });
}
function tryExec(cmd, args) { try { return execFileSync(cmd, args, { maxBuffer: 20e6, timeout: 60000 }).toString(); } catch (e) { return ""; } }
function pdfText(file) { return tryExec("pdftotext", ["-layout", file, "-"]); }
function pdfToPngs(file, prefix) { tryExec("pdftoppm", ["-r", "150", "-png", "-f", "1", "-l", "5", file, prefix]); return fs.readdirSync(TMP).filter((f) => f.startsWith(path.basename(prefix))).map((f) => path.join(TMP, f)); }
function ocr(img) { return tryExec("tesseract", [img, "stdout", "-l", "kor+eng", "--psm", "6"]); }

const HINT = /(비급여|수가|가격|요금|비용|임플란트|진료안내|치료비)/;
function host(u) { try { return new URL(u).host; } catch (e) { return ""; } }

(async () => {
  const { clinics, sample } = store.load();
  let targets = clinics.filter((c) => c.homepage);
  if (process.env.SCRAPE_ONLY) targets = targets.filter((c) => c.name.indexOf(process.env.SCRAPE_ONLY) >= 0);
  if (process.env.SCRAPE_LIMIT) targets = targets.slice(0, +process.env.SCRAPE_LIMIT);
  console.log("대상 홈페이지:", targets.length + "곳");

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: "ko-KR", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" });
  let updated = 0;

  for (const c of targets) {
    const found = [];
    let priceUrl = "";
    const base = c.homepage;
    const page = await ctx.newPage();
    page.setDefaultTimeout(25000);
    try {
      await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1500);
      // 방문할 페이지: 홈 + 비급여/수가 관련 동일호스트 링크 최대 5
      let links = [];
      try {
        links = await page.evaluate((H) => {
          const h = location.host, out = [];
          document.querySelectorAll("a[href]").forEach((a) => {
            const t = (a.textContent || "") + " " + a.getAttribute("href");
            if (new RegExp(H).test(t)) { try { const u = new URL(a.href); if (u.host === h) out.push(u.href); } catch (e) {} }
          });
          return out.slice(0, 12);
        }, HINT.source);
      } catch (e) {}
      const visit = [base].concat(links.filter((u, i, arr) => arr.indexOf(u) === i).slice(0, 5));

      for (const url of visit) {
        if (url !== base) { try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }); await page.waitForTimeout(800); } catch (e) { continue; } }
        // 1) HTML 텍스트(프레임 포함)
        for (const fr of page.frames()) { try { const tx = await fr.evaluate(() => document.body && document.body.innerText); const ps = extractImplant(tx); if (ps.length) { found.push.apply(found, ps); if (!priceUrl) priceUrl = url; } } catch (e) {} }
        // 2) 자산(pdf/이미지) 수집 — 비급여/수가 맥락일 때
        let assets = [];
        try {
          assets = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll("a[href]").forEach((a) => { if (/\.pdf(\?|$)/i.test(a.href)) out.push({ t: "pdf", u: a.href }); });
            document.querySelectorAll("img[src]").forEach((im) => { const s = im.src; if (/\.(png|jpe?g)(\?|$)/i.test(s) && (im.naturalWidth > 300 || im.width > 300)) out.push({ t: "img", u: s, alt: (im.alt || "") }); });
            return out;
          });
        } catch (e) {}
        // pdf 우선(최대 3)
        for (const a of assets.filter((x) => x.t === "pdf").slice(0, 3)) {
          const f = path.join(TMP, "d" + Math.random().toString(36).slice(2) + ".pdf");
          if (!(await download(a.u, f))) continue;
          let ps = extractImplant(pdfText(f));
          if (!ps.length) { for (const png of pdfToPngs(f, f + "-p")) { ps = extractImplant(ocr(png)); if (ps.length) break; } }
          if (ps.length) { found.push.apply(found, ps); if (!priceUrl) priceUrl = a.u; }
        }
        // 이미지 OCR(최대 8)
        for (const a of assets.filter((x) => x.t === "img").slice(0, 8)) {
          const ext = (a.u.match(/\.(png|jpe?g)/i) || [".png"])[0];
          const f = path.join(TMP, "i" + Math.random().toString(36).slice(2) + ext);
          if (!(await download(a.u, f))) continue;
          const ps = extractImplant(ocr(f));
          if (ps.length) { found.push.apply(found, ps); if (!priceUrl) priceUrl = url; }
        }
        if (found.length) break; // 한 페이지에서 찾으면 충분
      }
    } catch (e) { /* 무시 */ }
    await page.close();

    if (found.length) {
      const lo = Math.min.apply(null, found), hi = Math.max.apply(null, found);
      c.price = median(found);
      if (lo !== hi) { c.priceMin = lo; c.priceMax = hi; } else { delete c.priceMin; delete c.priceMax; }
      delete c.mats; // 홈페이지 게시가로 대체(심평원 재료별과 혼동 방지)
      const h = host(base);
      c.source = "site/" + h;
      c.priceSources = (c.priceSources ? c.priceSources + "|" : "") + "site/" + h;
      c.priceUrl = priceUrl || base;
      updated++;
      console.log("  ✅ " + c.name + " ← " + c.price.toLocaleString("ko-KR") + "원 (" + found.length + "건) " + (priceUrl || base));
    } else {
      console.log("  – " + c.name + " (수가표 못 찾음) " + base);
    }
  }
  await browser.close();
  store.write(require("./dedupe.js").dedupeClinics(clinics), sample);
  console.log("✅ 홈페이지 수가표 반영: " + updated + "곳 가격 덮어씀 / 대상 " + targets.length + "곳");
})();
