/*
 * scrape-clinic.js — 치과 홈페이지의 임플란트 비급여가(수가표) 수집 → 있으면 가격 덮어쓰기
 *   대상: clinics.js 에서 homepage 가 있는 치과 (homepages.js로 채움)
 *   방법: 홈페이지 + 비급여/수가/가격 하위페이지를 렌더 →
 *         ① HTML 텍스트  ② 이미지(Playwright 요소 스크린샷 → OCR, 핫링크차단 우회)  ③ PDF(텍스트→없으면 OCR)
 *   결과: 찾으면 price/priceMin/priceMax 덮어쓰기, source=site/<host>, 수가표 링크(priceUrl) 저장.
 *   실행: node scrape-clinic.js   (Playwright + poppler-utils + tesseract-ocr[-kor])
 *   옵션: SCRAPE_ONLY="치과명", SCRAPE_LIMIT=N
 */
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const https = require("https"), http = require("http");
const store = require("./store.js");

const PRICE_MIN = 300000, PRICE_MAX = 6000000;
const DEBUG = process.env.SCRAPE_DEBUG === "1";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "hp-"));
let tmpN = 0;
const tmpFile = (ext) => path.join(TMP, "f" + (tmpN++) + ext);

function wonOf(numStr, unit) { let n = parseInt(String(numStr).replace(/[^0-9]/g, ""), 10); if (/만/.test(unit)) n *= 10000; return n; }
function extractImplant(text) {
  if (!text) return [];
  const t = String(text).replace(/[\n\r\t]+/g, " ").replace(/ +/g, " ");
  const out = [];
  // 임플란트 뒤 60자 내 (점·콤마·공백 섞인) 숫자 + 만원/만/원
  const re = /임\s?플\s?란\s?트[^.\n]{0,60}?([0-9][0-9.,\s]{1,12}?)\s*(만\s?원|만|원)/g;
  let m; while ((m = re.exec(t))) { const n = wonOf(m[1], m[2]); if (n >= PRICE_MIN && n <= PRICE_MAX) out.push(n); }
  return out;
}
function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
const SILENT = { maxBuffer: 20e6, timeout: 60000, stdio: ["ignore", "pipe", "ignore"] };
function tryExec(cmd, args) { try { return execFileSync(cmd, args, SILENT).toString(); } catch (e) { return ""; } }
function ocr(img) { return tryExec("tesseract", [img, "stdout", "-l", "kor+eng", "--psm", "6"]); }
function isImage(f) { try { const b = fs.readFileSync(f).slice(0, 4); return (b[0] === 0xFF && b[1] === 0xD8) || (b[0] === 0x89 && b[1] === 0x50); } catch (e) { return false; } } // jpg/png
function isPdf(f) { try { return fs.readFileSync(f).slice(0, 4).toString() === "%PDF"; } catch (e) { return false; } }

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

const HINT = /(비급여|수가|가격|요금|비용|임플란트|진료안내|치료비|price|cost|fee|implant|nonpay|non_pay|bigeup|sugar)/i;
const COMMON = ["/price", "/bigeup", "/nonpay", "/non_pay", "/cost", "/fee", "/implant", "/sugar", "/price.html", "/sub/price", "/page/price"];
const PRICELIKE = /(price|cost|fee|nonpay|bigeup|sugar|비급여|수가)/i;
const host = (u) => { try { return new URL(u).host; } catch (e) { return ""; } };
const origin = (u) => { try { return new URL(u).origin; } catch (e) { return ""; } };

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
    const found = []; let priceUrl = ""; const base = c.homepage;
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);
    try {
      await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2500); // 핫링크/봇 챌린지(JS) 처리 대기
      let links = [];
      try {
        links = await page.evaluate((H) => {
          const h = location.host, out = [];
          document.querySelectorAll("a[href]").forEach((a) => {
            const t = (a.textContent || "") + " " + a.getAttribute("href");
            if (new RegExp(H, "i").test(t)) { try { const u = new URL(a.href); if (u.host === h) out.push(u.href); } catch (e) {} }
          });
          return out;
        }, HINT.source);
      } catch (e) {}
      const og = origin(base);
      const visit = [base]
        .concat(links.filter((u, i, a) => a.indexOf(u) === i).slice(0, 6))
        .concat(COMMON.map((p) => og + p))
        .filter((u, i, a) => a.indexOf(u) === i).slice(0, 16);

      let imgBudget = 12;
      for (const url of visit) {
        if (url !== base) { try { const rr = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }); if (rr && rr.status() >= 400) continue; await page.waitForTimeout(1200); } catch (e) { continue; } }
        let pageBigeup = PRICELIKE.test(url);
        for (const fr of page.frames()) {
          // 1) 텍스트
          try { const tx = await fr.evaluate(() => document.body && document.body.innerText); if (/비급여|수가/.test(tx || "")) pageBigeup = true; if (DEBUG && /임\s?플\s?란\s?트/.test(tx || "")) console.log("  [텍스트]" + url + " :: " + (tx.replace(/\s+/g, " ").match(/.{0,8}임\s?플\s?란\s?트.{0,45}/g) || []).slice(0, 4).join(" ｜ ")); const ps = extractImplant(tx); if (ps.length) { found.push.apply(found, ps); if (!priceUrl) priceUrl = url; } } catch (e) {}
          // 1b) 원본 HTML(숨김 팝업·푸터 비급여고지표 등 innerText에 안 잡히는 것까지) — view-source에 있는 수가표 회수
          try { const html = await fr.content(); const raw = String(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&"); if (/비급여|수가/.test(raw)) pageBigeup = true; if (DEBUG && /임\s?플\s?란\s?트/.test(raw)) console.log("  [HTML]" + url + " :: " + (raw.replace(/\s+/g, " ").match(/.{0,8}임\s?플\s?란\s?트.{0,55}/g) || []).slice(0, 6).join(" ｜ ")); const ps = extractImplant(raw); if (ps.length) { found.push.apply(found, ps); if (!priceUrl) priceUrl = url; } } catch (e) {}
          // 2) 이미지 요소 스크린샷 → OCR (핫링크차단 우회)
          if (imgBudget > 0) {
            let imgs = []; try { imgs = await fr.$$("img"); } catch (e) {}
            for (const h of imgs) {
              if (imgBudget <= 0) break;
              let box = null; try { box = await h.boundingBox(); } catch (e) {}
              if (!box || box.width < 300 || box.height < 80) continue;
              imgBudget--;
              const f = tmpFile(".png");
              try { await h.screenshot({ path: f }); } catch (e) { continue; }
              const o = ocr(f);
              if (DEBUG && /임\s?플\s?란\s?트|[0-9]{6}|만\s?원/.test(o)) console.log("  [이미지OCR]" + url + " :: " + o.replace(/\s+/g, " ").slice(0, 200));
              const ps = extractImplant(o);
              if (ps.length) { found.push.apply(found, ps); if (!priceUrl) priceUrl = url; }
            }
          }
          // 3) PDF 링크
          let pdfs = []; try { pdfs = await fr.evaluate(() => Array.prototype.slice.call(document.querySelectorAll('a[href]')).map((a) => a.href).filter((u) => /\.pdf(\?|$)/i.test(u))); } catch (e) {}
          for (const pu of pdfs.slice(0, 3)) {
            const f = tmpFile(".pdf");
            if (!(await download(pu, f)) || !isPdf(f)) continue;
            let ps = extractImplant(tryExec("pdftotext", ["-layout", f, "-"]));
            if (!ps.length) {
              tryExec("pdftoppm", ["-r", "150", "-png", "-f", "1", "-l", "4", f, f + "-p"]);
              for (const png of fs.readdirSync(TMP).filter((x) => x.startsWith(path.basename(f) + "-p")).map((x) => path.join(TMP, x))) { ps = extractImplant(ocr(png)); if (ps.length) break; }
            }
            if (ps.length) { found.push.apply(found, ps); if (!priceUrl) priceUrl = pu; }
          }
        }
        // 4) 비급여/가격 페이지인데 아직 못 찾았으면 전체 화면 OCR(이미지형 수가표 통째로)
        if (!found.length && pageBigeup) {
          const f = tmpFile(".png");
          try { await page.screenshot({ path: f, fullPage: true }); } catch (e) {}
          if (isImage(f)) { const o = ocr(f); if (DEBUG) console.log("  [전체OCR]" + url + " :: " + (o.replace(/\s+/g, " ").match(/.{0,8}임\s?플\s?란\s?트.{0,45}|.{0,20}만\s?원.{0,5}/g) || []).slice(0, 6).join(" ｜ ") || "(임플란트/원 토큰 없음, 길이 " + o.length + ")"); const ps = extractImplant(o); if (ps.length) { found.push.apply(found, ps); if (!priceUrl) priceUrl = url; } }
        }
        if (found.length) break;
      }
    } catch (e) {}
    await page.close();

    if (found.length) {
      const lo = Math.min.apply(null, found), hi = Math.max.apply(null, found);
      c.price = median(found);
      if (lo !== hi) { c.priceMin = lo; c.priceMax = hi; } else { delete c.priceMin; delete c.priceMax; }
      delete c.mats;
      const h = host(base);
      c.source = "site/" + h;
      c.priceSources = (c.priceSources ? c.priceSources + "|" : "") + "site/" + h;
      c.priceUrl = priceUrl || base;
      updated++;
      console.log("  ✅ " + c.name + " ← " + c.price.toLocaleString("ko-KR") + "원 (" + found.length + "건)");
    } else {
      console.log("  – " + c.name + " (수가표 못 찾음)");
    }
  }
  await browser.close();
  store.write(require("./dedupe.js").dedupeClinics(clinics), sample);
  console.log("✅ 홈페이지 수가표 반영: " + updated + "곳 가격 덮어씀 / 대상 " + targets.length + "곳");
})();
