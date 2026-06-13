/*
 * share.js — 결과를 카드 이미지(PNG)로 저장 + 공유 (외부 라이브러리 0)
 *  ShareCard.mount(el, getData)  : 저장/공유 버튼 mount
 *  ShareCard.drawCard(data)      : 카드 canvas 생성 (data.ratio: "1:1" 기본 | "9:16")
 *  ShareCard.download(canvas,nm) : PNG 다운로드
 * data = { title, big, lines:[{k,v}], site, fileName, ratio, theme }
 * 비-SEO 바이럴 장치(카톡·인스타 스토리·쇼츠). 강자들과의 차별점.
 */
(function (root) {
  "use strict";

  function drawCard(data) {
    data = data || {};
    var W = 1080, H = data.ratio === "9:16" ? 1920 : 1080;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var x = c.getContext("2d");

    var g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0e1117"); g.addColorStop(1, "#1c2230");
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    var g2 = x.createLinearGradient(0, 0, W, 0);
    if (data.theme === "wedding") { g2.addColorStop(0, "#f472b6"); g2.addColorStop(1, "#fb7185"); }
    else { g2.addColorStop(0, "#3b82f6"); g2.addColorStop(1, "#22d3ee"); }
    x.fillStyle = g2; x.fillRect(0, 0, W, 16);

    var KR = '"Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    x.textAlign = "center";

    // 타이틀
    x.fillStyle = "#9aa4ba";
    x.font = "bold 48px " + KR;
    x.fillText(data.title || "", W / 2, H * 0.18);

    // 큰 숫자
    x.font = "900 132px " + KR;
    x.fillStyle = g2;
    wrapCenter(x, data.big || "", W / 2, H * 0.30, 980, 132);

    // 라인들
    var lines = data.lines || [];
    x.font = "42px " + KR;
    var y = H * 0.46, step = Math.min(120, (H * 0.40) / Math.max(1, lines.length));
    lines.forEach(function (ln) {
      x.fillStyle = "#283041"; x.fillRect(120, y - 38, 840, 2);
      x.textAlign = "left"; x.fillStyle = "#9aa4ba"; x.font = "40px " + KR; x.fillText(ln.k || "", 130, y + 28);
      x.textAlign = "right"; x.fillStyle = "#e9edf6"; x.font = "bold 46px " + KR; x.fillText(ln.v || "", 950, y + 28);
      y += step;
    });

    // 푸터
    x.textAlign = "center";
    x.fillStyle = data.theme === "wedding" ? "#fb7185" : "#22d3ee";
    x.font = "bold 40px " + KR;
    x.fillText(data.site || "계산기허브", W / 2, H - 92);
    x.fillStyle = "#6b7280"; x.font = "32px " + KR;
    x.fillText(data.cta || "내 결과도 확인해보세요 →", W / 2, H - 44);

    return c;
  }

  function wrapCenter(ctx, text, cx, y, maxW, lh) {
    var words = String(text).split(" "), line = "", lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    var startY = y - (lines.length - 1) * lh / 2;
    lines.forEach(function (l, i) { ctx.fillText(l, cx, startY + i * lh); });
  }

  function toBlob(canvas) {
    return new Promise(function (res) {
      if (canvas.toBlob) canvas.toBlob(res, "image/png");
      else res(dataURLtoBlob(canvas.toDataURL("image/png")));
    });
  }
  function dataURLtoBlob(d) {
    var a = d.split(","), m = a[0].match(/:(.*?);/)[1], b = atob(a[1]), n = b.length, u = new Uint8Array(n);
    while (n--) u[n] = b.charCodeAt(n);
    return new Blob([u], { type: m });
  }
  function download(canvas, name) {
    var a = document.createElement("a");
    a.download = (name || "result") + ".png";
    a.href = canvas.toDataURL("image/png");
    document.body.appendChild(a); a.click(); a.remove();
  }

  function mount(container, getData) {
    if (!container) return;
    container.innerHTML =
      '<button type="button" class="sharebtn" data-act="save">📷 결과 이미지로 저장</button>' +
      '<button type="button" class="sharebtn alt" data-act="share">🔗 공유하기</button>';
    container.querySelector('[data-act=save]').addEventListener("click", function () {
      var d = getData(); if (!d) return;
      download(drawCard(d), d.fileName || "결과");
    });
    container.querySelector('[data-act=share]').addEventListener("click", async function () {
      var d = getData(); if (!d) return;
      var canvas = drawCard(d);
      try {
        var blob = await toBlob(canvas);
        var file = new File([blob], (d.fileName || "결과") + ".png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: d.title, text: (d.title || "") + " " + (d.big || "") });
          return;
        }
      } catch (e) { /* 폴백 */ }
      download(canvas, d.fileName || "결과");
    });
  }

  root.ShareCard = { mount: mount, drawCard: drawCard, download: download, toBlob: toBlob };
})(typeof window !== "undefined" ? window : this);
