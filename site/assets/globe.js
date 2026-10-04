// Waysake landing: a dotted globe with the five demo trips. Loaded only when its stage comes near the screen.
// Land dots: Natural Earth 1:50m land (public domain) via world-atlas, sampled every 1.25°.
(function () {
  "use strict";
  var stage = document.querySelector("[data-globe]");
  if (!stage) return;
  var cv = stage.querySelector("canvas");
  var ctx = cv.getContext("2d");
  if (!ctx) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var D = Math.PI / 180;

  // The five demo trips (scripts/demo-trips.ts), colours from the dark palette (the stage is always ink).
  var TRIPS = {
    italy: { c: "#E49E38", s: [[12.3358, 45.4375], [12.1357, 46.5405], [12.0853, 46.6943], [11.6714, 46.5747], [14.1146, 46.3683], [14.5058, 46.0569], [13.6387, 45.0812], [15.582, 44.8654], [16.4402, 43.5081], [16.4411, 43.1729], [18.0944, 42.6507]] },
    sicily: { c: "#68E3DE", s: [[13.3615, 38.1157], [14.0226, 38.0388], [14.9934, 37.751], [15.2853, 37.8516], [15.2866, 37.0755]] },
    canary: { c: "#E87162", s: [[-16.2518, 28.4636], [-16.6425, 28.2724], [-16.7363, 28.0916]] },
    berlin: { c: "#D85584", s: [[13.405, 52.52]] },
    amsterdam: { c: "#7DCBFE", s: [[4.9041, 52.3676]] }
  };
  var HOME = [2.3522, 48.8566];
  var KEYS = Object.keys(TRIPS);

  // Unit vectors, for great-circle interpolation.
  var vec = function (p) { var l = p[0] * D, f = p[1] * D; return [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]; };
  var slerp = function (a, b, t) {
    var d = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    if (d < 1e-6) return a;
    var s = Math.sin(d), k1 = Math.sin((1 - t) * d) / s, k2 = Math.sin(t * d) / s;
    return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
  };
  var path = function (pts, n) {
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = vec(pts[i]), b = vec(pts[i + 1]);
      for (var j = 0; j < n; j++) out.push(slerp(a, b, j / n));
    }
    out.push(vec(pts[pts.length - 1]));
    return out;
  };
  KEYS.forEach(function (k) {
    var t = TRIPS[k];
    t.route = path(t.s, 12);
    t.stops = t.s.map(vec);
    // Flight from home, raised above the surface.
    var a = vec(HOME), b = t.stops[0], fl = [];
    var dist = Math.acos(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
    for (var i = 0; i <= 40; i++) {
      var p = slerp(a, b, i / 40), h = 1 + Math.sin(Math.PI * i / 40) * dist * 0.22;
      fl.push([p[0] * h, p[1] * h, p[2] * h]);
    }
    t.flight = fl;
  });
  var home = vec(HOME);

  // View: centre longitude/latitude, eased toward a target.
  var view = { l: 1, f: 17 }, drag = { l: 0, f: 0 }, focus = null, focusAt = 0;
  var W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1, baseF = 17, baseL = 1;
  var dots = null, ready = false, running = false, start = 0;

  var resize = function () {
    var r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(r.width * dpr); H = Math.round(r.height * dpr);
    cv.width = W; cv.height = H;
    var wide = r.width >= 640;
    R = wide ? Math.min(H * 0.98, W * 0.62) : W * 1.3;
    cx = W / 2; cy = wide ? H : H * 1.04;
    baseF = wide ? 17 : 7; baseL = wide ? 1 : -3;
  };

  // Rotation: project a unit vector for the current view. Returns [x, y, z] on screen (z > 0 faces us).
  var sl, cl, sf, cf;
  var setView = function (l, f) { sl = Math.sin(-l * D); cl = Math.cos(-l * D); sf = Math.sin(f * D); cf = Math.cos(f * D); };
  var proj = function (v) {
    // rotate around z by -l, then around y by f
    var x = v[0] * cl - v[1] * sl, y = v[0] * sl + v[1] * cl, z = v[2];
    var x2 = x * cf + z * sf, z2 = -x * sf + z * cf;
    return [cx + R * y, cy - R * z2, x2];
  };

  var draw = function (now) {
    var t = now - start;
    var grow = reduce.matches ? 1 : Math.min(1, Math.max(0, (t - 300) / 2600));
    grow = 1 - Math.pow(1 - grow, 3);
    var tl = baseL + (reduce.matches ? 0 : 8 * Math.sin(t / 9000)), tf = baseF + (reduce.matches ? 0 : 2 * Math.sin(t / 13000));
    if (focus) {
      var s = TRIPS[focus].s, ml = 0, mf = 0;
      s.forEach(function (p) { ml += p[0]; mf += p[1]; });
      tl = ml / s.length; tf = mf / s.length - (baseF === 17 ? 24 : 30);
    }
    var k = reduce.matches ? 1 : 0.06;
    view.l += (tl + drag.l - view.l) * k;
    view.f += (Math.max(-10, Math.min(75, tf + drag.f)) - view.f) * k;
    setView(view.l, view.f);

    ctx.clearRect(0, 0, W, H);
    // Sphere
    var g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.45, R * 0.1, cx, cy, R);
    g.addColorStop(0, "rgba(255,255,255,0.07)");
    g.addColorStop(1, "rgba(255,255,255,0.015)");
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1 * dpr; ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.stroke();

    // Land dots, bucketed by depth so they fade toward the edge.
    var sz = Math.max(1.3 * dpr, R / 380);
    var buckets = [[], [], [], []];
    for (var i = 0; i < dots.length; i++) {
      var p = proj(dots[i]);
      if (p[2] <= 0.02) continue;
      if (p[0] < -4 || p[0] > W + 4 || p[1] < -4 || p[1] > H + 4) continue;
      buckets[Math.min(3, (p[2] * 4) | 0)].push(p);
    }
    var alphas = [0.14, 0.24, 0.34, 0.46];
    for (var b = 0; b < 4; b++) {
      ctx.fillStyle = "rgba(237,237,235," + alphas[b] + ")";
      ctx.beginPath();
      var L = buckets[b];
      for (var j = 0; j < L.length; j++) ctx.rect(L[j][0] - sz / 2, L[j][1] - sz / 2, sz, sz);
      ctx.fill();
    }

    var line = function (pts, upto, color, width, dash, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.setLineDash(dash);
      ctx.beginPath();
      var n = Math.max(1, Math.round((pts.length - 1) * upto)), pen = false;
      for (var i = 0; i <= n; i++) {
        var p = proj(pts[i]);
        if (p[2] < -0.05) { pen = false; continue; }
        if (!pen) { ctx.moveTo(p[0], p[1]); pen = true; } else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke(); ctx.restore();
    };

    KEYS.forEach(function (key) {
      var tr = TRIPS[key];
      var dim = focus && focus !== key ? 0.18 : 1;
      line(tr.flight, grow, tr.c, 1.2 * dpr, [2 * dpr, 5 * dpr], 0.55 * dim);
    });
    KEYS.forEach(function (key) {
      var tr = TRIPS[key];
      var dim = focus && focus !== key ? 0.18 : 1;
      var g2 = Math.max(0, Math.min(1, (grow - 0.35) / 0.65));
      if (tr.route.length > 1 && g2 > 0) {
        line(tr.route, g2, tr.c, 7 * dpr, [], 0.16 * dim);
        line(tr.route, g2, tr.c, 2.4 * dpr, [], dim);
      }
      var shown = Math.ceil(tr.stops.length * g2);
      for (var i = 0; i < shown; i++) {
        var p = proj(tr.stops[i]);
        if (p[2] <= 0) continue;
        var last = i === tr.stops.length - 1;
        ctx.globalAlpha = dim;
        ctx.beginPath(); ctx.arc(p[0], p[1], (last ? 4.2 : 3.2) * dpr, 0, Math.PI * 2);
        ctx.fillStyle = last ? tr.c : "#0D0D10"; ctx.fill();
        ctx.lineWidth = 1.8 * dpr; ctx.strokeStyle = tr.c; ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });

    // Home
    var hp = proj(home);
    if (hp[2] > 0) {
      ctx.beginPath(); ctx.arc(hp[0], hp[1], 3.6 * dpr, 0, Math.PI * 2); ctx.fillStyle = "#EDEDEB"; ctx.fill();
      ctx.beginPath(); ctx.arc(hp[0], hp[1], 7 * dpr, 0, Math.PI * 2); ctx.lineWidth = 1 * dpr; ctx.strokeStyle = "rgba(237,237,235,0.35)"; ctx.stroke();
      ctx.font = "500 " + 12 * dpr + "px Geist, system-ui, sans-serif"; ctx.fillStyle = "rgba(237,237,235,0.75)";
      ctx.fillText("Home", hp[0] + 11 * dpr, hp[1] + 4 * dpr);
    }
    if (focus) {
      var fp = proj(TRIPS[focus].stops[TRIPS[focus].stops.length - 1]);
      var name = stage.querySelector('[data-trip="' + focus + '"]');
      if (name && fp[2] > 0) {
        ctx.font = "600 " + 13 * dpr + "px Geist, system-ui, sans-serif"; ctx.fillStyle = "#EDEDEB";
        ctx.fillText(name.firstChild.nextSibling.textContent.trim(), fp[0] + 12 * dpr, fp[1] + 4 * dpr);
      }
    }
  };

  var loop = function (now) {
    if (!running) return;
    draw(now);
    if (reduce.matches && !dragging) { running = false; return; }
    requestAnimationFrame(loop);
  };
  var play = function () { if (!running && ready) { running = true; requestAnimationFrame(loop); } };

  // Interaction: drag to turn, legend to focus a trip.
  var dragging = false, px = 0, py = 0;
  stage.addEventListener("pointerdown", function (e) {
    if (e.target.closest("button")) return;
    dragging = true; px = e.clientX; py = e.clientY;
    stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
    play();
  });
  stage.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var s = 1 / (R / dpr) / D * 0.9;
    drag.l -= (e.clientX - px) * s; drag.f += (e.clientY - py) * s;
    drag.f = Math.max(-30, Math.min(40, drag.f));
    px = e.clientX; py = e.clientY;
  });
  var stop = function () { dragging = false; };
  stage.addEventListener("pointerup", stop);
  stage.addEventListener("pointercancel", stop);

  var buttons = stage.querySelectorAll("[data-trip]");
  var setFocus = function (k) {
    focus = k;
    Array.prototype.forEach.call(buttons, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-trip") === k)); });
    play();
  };
  Array.prototype.forEach.call(buttons, function (b) {
    b.setAttribute("aria-pressed", "false");
    var k = b.getAttribute("data-trip");
    b.addEventListener("click", function () { drag.l = 0; drag.f = 0; setFocus(focus === k ? null : k); });
    b.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && !pinned()) { focus = k; play(); } });
    b.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse" && !pinned()) { focus = null; play(); } });
  });
  var pinned = function () { return stage.querySelector('[data-trip][aria-pressed="true"]'); };

  var onResize = function () { resize(); if (ready && !running) draw(performance.now()); };
  window.addEventListener("resize", onResize);

  fetch(document.querySelector('script[src$="globe.js"]').src.replace(/globe\.js.*$/, "land.json"))
    .then(function (r) { return r.json(); })
    .then(function (rows) {
      var out = [];
      rows.forEach(function (row) {
        var f = row[0] / 10;
        row[1].forEach(function (l) { out.push(vec([l / 10 - 180, f])); });
      });
      dots = out;
      resize();
      ready = true;
      start = performance.now();
      stage.classList.add("ready");
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (en) {
          if (en[0].isIntersecting) play(); else running = false;
        }).observe(stage);
      } else play();
      document.addEventListener("visibilitychange", function () { if (document.hidden) running = false; else play(); });
      if (reduce.matches) draw(start);
    })
    .catch(function () {});
})();
