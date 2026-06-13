/*
 * regions.js — 구(자치구) ↔ URL 슬러그 (Node + 브라우저 겸용)
 * build.js(정적 페이지 파일명)와 지역 링크가 함께 사용 → 링크 일관성.
 * 우선 인천 연수구만. 확장 시 여기에 추가.
 */
(function (root) {
  "use strict";
  var SLUGS = {
    "연수구": "yeonsu",
    // 확장 예시: "남동구":"namdong", "미추홀구":"michuhol", ...
  };
  root.REGION_SLUGS = SLUGS;     // 호환용 별칭
  root.DISTRICT_SLUGS = SLUGS;
})(typeof window !== "undefined" ? window : this);
