// Waysake landing: hero video, scroll reveals, the photo wall, the globe and the demo, copy buttons.
// No cookies, no storage, no third-party calls.
(function () {
  "use strict";

  // ---- Hero video -------------------------------------------------------
  var video = document.getElementById("film");
  var playBtn = document.getElementById("film-play");
  var soundBtn = document.getElementById("film-sound");
  var fullBtn = document.getElementById("film-full");
  if (video && playBtn) {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var userPaused = false;
    var playLabel = playBtn.querySelector(".sr-only");

    var sync = function () {
      var playing = !video.paused && !video.ended;
      playBtn.setAttribute("aria-pressed", String(playing));
      playLabel.textContent = playing ? "Pause the video" : "Play the video";
    };
    var play = function () {
      if (video.preload === "none") video.preload = "auto";
      var p = video.play();
      if (p && p.catch) p.catch(function () { sync(); });
    };

    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);

    playBtn.addEventListener("click", function () {
      if (video.paused) { userPaused = false; play(); }
      else { userPaused = true; video.pause(); }
    });

    // Autoplay (muted, looped) only when motion is welcome; wait for the page load so it never delays it.
    var autoplay = function () { if (!reduce.matches && !userPaused) play(); };
    if (document.readyState === "complete") autoplay();
    else window.addEventListener("load", autoplay);

    // Pause while off screen; resume when back, unless the visitor paused it.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        var e = entries[0];
        if (!e.isIntersecting && !video.paused) video.pause();
        else if (e.isIntersecting && video.paused && !userPaused && !reduce.matches && video.preload !== "none") play();
      }, { threshold: 0.25 }).observe(video);
    }

    // The sound button only appears if the file actually has an audio track.
    var hasAudio = function () {
      return Boolean(video.mozHasAudio || (video.audioTracks && video.audioTracks.length) || video.webkitAudioDecodedByteCount > 0);
    };
    var checkAudio = function () { if (soundBtn && soundBtn.hidden && hasAudio()) soundBtn.hidden = false; };
    video.addEventListener("loadeddata", checkAudio);
    video.addEventListener("timeupdate", checkAudio);
    if (soundBtn) {
      soundBtn.addEventListener("click", function () {
        video.muted = !video.muted;
        soundBtn.setAttribute("aria-pressed", String(!video.muted));
        if (!video.muted && video.paused) { userPaused = false; play(); }
      });
    }

    if (fullBtn) {
      var canFull = video.requestFullscreen || video.webkitRequestFullscreen || video.webkitEnterFullscreen;
      if (!canFull) fullBtn.hidden = true;
      fullBtn.addEventListener("click", function () {
        userPaused = false;
        play();
        if (video.requestFullscreen) video.requestFullscreen();
        else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
        else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      });
      document.addEventListener("fullscreenchange", function () {
        video.controls = document.fullscreenElement === video;
      });
    }
    sync();
  }


  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var hasIO = "IntersectionObserver" in window;

  // ---- Scroll reveals ---------------------------------------------------
  var reveals = document.querySelectorAll("[data-reveal]");
  if (!hasIO) {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add("in"); });
  } else {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });
    Array.prototype.forEach.call(reveals, function (el) { revealIO.observe(el); });
  }

  // ---- The photo wall sorts itself into trips ---------------------------
  // Set up after the page load, so it never competes with the first paint.
  var initWall = function () {
    var wall = document.querySelector("[data-wall]");
    if (wall && hasIO && !reduceMotion.matches && wall.getBoundingClientRect().top > window.innerHeight * 0.7) {
      var tiles = Array.prototype.slice.call(wall.querySelectorAll(".wall-tiles li"));
      var seed = 7;
      var rand = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      var order = tiles.map(function (_, i) { return i; });
      for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
      var spin = tiles.map(function () { return (rand() * 10 - 5).toFixed(1); });
      var delay = tiles.map(function () { return (rand() * 0.4).toFixed(2) + "s"; });
      var sorted = false;
      var scatter = function () {
        tiles.forEach(function (t) { t.style.transition = "none"; t.style.transform = ""; });
        var pos = tiles.map(function (t) { var b = t.getBoundingClientRect(); return [b.left, b.top]; });
        tiles.forEach(function (t, i) {
          var to = pos[order[i]];
          t.style.transform = "translate(" + (to[0] - pos[i][0]) + "px," + (to[1] - pos[i][1]) + "px) rotate(" + spin[i] + "deg)";
          t.style.setProperty("--wd", delay[i]);
        });
        void wall.offsetWidth;
        tiles.forEach(function (t) { t.style.transition = ""; });
      };
      wall.classList.add("messy");
      scatter();
      var sort = function () {
        if (sorted) return;
        sorted = true;
        wall.classList.remove("messy");
        tiles.forEach(function (t) { t.style.transform = ""; });
      };
      var timer;
      var wallIO = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { timer = setTimeout(function () { sort(); wallIO.disconnect(); }, 450); }
        else clearTimeout(timer);
      }, { threshold: 0.55 });
      wallIO.observe(wall);
      window.addEventListener("resize", function () { if (!sorted) scatter(); });
    }
  };
  if (document.readyState === "complete") initWall();
  else window.addEventListener("load", initWall);

  // ---- The globe: load its script only when the stage comes near ---------
  var stage = document.querySelector("[data-globe]");
  if (stage && window.HTMLCanvasElement) {
    var loadGlobe = function () {
      var s = document.createElement("script");
      s.src = "assets/globe.js";
      s.async = true;
      document.body.appendChild(s);
    };
    if (hasIO) {
      var globeIO = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { globeIO.disconnect(); loadGlobe(); }
      }, { rootMargin: "600px 0px" });
      globeIO.observe(stage);
    } else loadGlobe();
  }

  // ---- The live demo, loaded only on request ----------------------------
  var device = document.querySelector("[data-demo]");
  if (device) {
    var playDemo = device.querySelector("[data-demo-play]");
    var screen = device.querySelector(".device-screen");
    var note = document.querySelector("[data-demo-note]");
    var check = null;
    var demoExists = function () {
      if (!check) {
        check = window.fetch
          ? fetch("app/", { method: "HEAD", cache: "no-store" }).then(function (r) { return r.ok; }, function () { return false; })
          : Promise.resolve(true);
      }
      return check;
    };
    var demoTheme = function () {
      var t = document.documentElement.getAttribute("data-theme");
      if (t === "dark" || t === "light") return t;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    };
    // Links to the full-screen demo carry the page's theme.
    Array.prototype.forEach.call(document.querySelectorAll("[data-app-link]"), function (a) {
      a.addEventListener("click", function () { a.href = "app/?lang=en&theme=" + demoTheme(); });
    });
    var markMissing = function (ok) {
      if (ok) return;
      document.documentElement.classList.add("demo-off");
      playDemo.hidden = true;
      note.textContent = "The live demo is coming soon.";
    };
    if (hasIO) {
      var demoIO = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { demoIO.disconnect(); demoExists().then(markMissing); }
      }, { rootMargin: "300px 0px" });
      demoIO.observe(device);
    }
    playDemo.addEventListener("click", function () {
      demoExists().then(function (ok) {
        if (!ok) { markMissing(false); return; }
        var frame = document.createElement("iframe");
        frame.src = "app/?lang=en&theme=" + demoTheme();
        frame.title = "Waysake demo";
        frame.loading = "lazy";
        frame.setAttribute("allow", "fullscreen");
        screen.appendChild(frame);
        device.classList.add("live");
        frame.focus();
      });
    });
  }

  // ---- Copy buttons -----------------------------------------------------
  var selectText = function (el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  Array.prototype.forEach.call(document.querySelectorAll("[data-copy]"), function (btn) {
    var id = btn.getAttribute("data-copy");
    var source = document.getElementById(id);
    var status = document.querySelector('[data-status="' + id + '"]');
    var label = btn.querySelector("span");
    var timer;
    var done = function () {
      label.textContent = "Copied";
      status.textContent = "Copied to the clipboard.";
      clearTimeout(timer);
      timer = setTimeout(function () { label.textContent = "Copy"; status.textContent = ""; }, 2400);
    };
    var fallback = function () {
      selectText(source);
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      if (ok) done();
      else status.textContent = "The text is selected: press " + (isMac ? "⌘C" : "Ctrl+C") + " to copy it.";
    };
    btn.addEventListener("click", function () {
      var text = source.innerText.replace(/ /g, " ");
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }
    });
  });
})();
