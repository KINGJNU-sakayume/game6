// dist-artifact/app.js + app.css → dist-artifact/order-set.html (claude.ai 아티팩트용 단일 페이지)
// 페이지 계약: doctype/html/head/body 없이 <title>부터 시작한다. 글꼴은 Google Fonts, React는 cdnjs UMD
// (실패하면 jsdelivr), 나머지는 모두 인라인.
import { readFileSync, writeFileSync, statSync } from "node:fs";

const REACT = "18.3.1";
const dir = "dist-artifact";
const js = readFileSync(`${dir}/app.js`, "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync(`${dir}/app.css`, "utf8").replace(/<\/style/gi, "<\\/style");
const fonts =
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Black+Han+Sans&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Nanum+Pen+Script&display=swap";
const cdnjs = (lib, file) => `https://cdnjs.cloudflare.com/ajax/libs/${lib}/${REACT}/umd/${file}`;
const jsdelivr = (lib, file) => `https://cdn.jsdelivr.net/npm/${lib}@${REACT}/umd/${file}`;

const html = `<title>오더 세트</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<style>
${css}
</style>
<div id="root"></div>
<script src="${cdnjs("react", "react.production.min.js")}"></script>
<script src="${cdnjs("react-dom", "react-dom.production.min.js")}"></script>
<script>
(function () {
  function run() {
${js}
  }
  if (window.React && window.ReactDOM) return run();
  var urls = [];
  if (!window.React) urls.push("${jsdelivr("react", "react.production.min.js")}");
  urls.push("${jsdelivr("react-dom", "react-dom.production.min.js")}");
  (function next() {
    if (!urls.length) return run();
    var s = document.createElement("script");
    s.src = urls.shift();
    s.onload = next;
    s.onerror = function () {
      var el = document.getElementById("root");
      if (el) el.textContent = "화면 라이브러리(React)를 불러오지 못했다. 네트워크를 확인하고 새로 고쳐 주세요.";
    };
    document.head.appendChild(s);
  })();
})();
</script>
`;
const out = `${dir}/order-set.html`;
writeFileSync(out, html);
console.log(`${out} ${(statSync(out).size / 1024).toFixed(0)} KB`);

// 검사용: 아티팩트 호스트가 씌우는 뼈대(문자 집합·뷰포트·작은 초기화)를 흉내 낸 페이지. 게시하지 않는다.
const preview = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;background:#fafaf7}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${html}</body>
</html>
`;
writeFileSync(`${dir}/preview.html`, preview);
console.log(`${dir}/preview.html (검사용)`);
