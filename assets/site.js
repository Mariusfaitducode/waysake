// Waysake landing: hero video controls and copy buttons. No cookies, no storage, no network calls.
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
