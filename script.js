/* Krivyo site — hero capture sequence + scroll reveals */

(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------
     Scroll reveals
     --------------------------------------------- */
  var revealables = document.querySelectorAll(".reveal");

  if (reduced || !("IntersectionObserver" in window)) {
    revealables.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        setTimeout(function () { el.classList.add("in"); }, i * 70);
        io.unobserve(el);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---------------------------------------------
     Hero: the ring moves, the step list fills
     Mirrors what the extension actually does —
     highlight the element, then emit a step.
     --------------------------------------------- */
  var stage  = document.getElementById("stage");
  var ring   = document.getElementById("ring");
  var steps  = document.querySelectorAll("#steps li");
  var count  = document.getElementById("count");
  var typed  = document.getElementById("typed");
  var selval = document.getElementById("selval");
  var caret  = document.querySelector(".caret");

  if (!stage || !ring || !steps.length) return;

  var NAME = "Nordwind Logistics";

  function place(target) {
    var t = target.getBoundingClientRect();
    var s = stage.getBoundingClientRect();
    ring.style.opacity = "1";
    ring.style.width  = (t.width + 10) + "px";
    ring.style.height = (t.height + 10) + "px";
    ring.style.transform =
      "translate(" + (t.left - s.left - 5) + "px," + (t.top - s.top - 5) + "px)";
  }

  function target(n) {
    var host = stage.querySelector('[data-t="' + n + '"]');
    if (!host) return null;
    return host.querySelector(".ctrl") || host;
  }

  function emit(i) {
    if (steps[i]) steps[i].classList.add("in");
    if (count) count.textContent = (i + 1) + (i === 0 ? " step" : " steps");
  }

  function typeName(done) {
    var i = 0;
    if (caret) caret.classList.add("on");
    (function tick() {
      typed.textContent = NAME.slice(0, i);
      if (i++ <= NAME.length) {
        setTimeout(tick, 42);
      } else {
        if (caret) caret.classList.remove("on");
        done();
      }
    })();
  }

  function reset() {
    steps.forEach(function (li) { li.classList.remove("in"); });
    if (typed) typed.textContent = "";
    if (selval) selval.textContent = "Select…";
    if (count) count.textContent = "0 steps";
    ring.style.opacity = "0";
  }

  function finalState() {
    steps.forEach(function (li) { li.classList.add("in"); });
    if (typed) typed.textContent = NAME;
    if (selval) selval.textContent = "Standard supplier";
    if (count) count.textContent = "4 steps";
    var last = target(4);
    if (last) place(last);
  }

  if (reduced) {
    finalState();
    return;
  }

  var timers = [];
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }

  function run() {
    timers.forEach(clearTimeout);
    timers = [];
    reset();

    /* 01 — click the name field */
    at(700,  function () { var t = target(1); if (t) place(t); });
    at(1150, function () { emit(0); });

    /* 02 — type the value */
    at(1400, function () { typeName(function () { emit(1); }); });

    /* 03 — pick the supplier type */
    at(3300, function () { var t = target(2); if (t) place(t); });
    at(3750, function () {
      if (selval) selval.textContent = "Standard supplier";
      emit(2);
    });

    /* 04 — save */
    at(4700, function () { var t = target(4); if (t) place(t); });
    at(5150, function () { emit(3); });

    /* hold, then loop */
    at(9200, run);
  }

  /* Only animate while the hero is actually on screen */
  if ("IntersectionObserver" in window) {
    var heroIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          run();
        } else {
          timers.forEach(clearTimeout);
          timers = [];
        }
      });
    }, { threshold: 0.25 });
    heroIO.observe(stage);
  } else {
    run();
  }

  /* Keep the ring aligned if the layout shifts */
  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(run, 220);
  });
})();
