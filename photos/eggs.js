/* Small surprises on the photo page. Nothing here is needed for uploading. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var MONOGRAM = "Rola, I couldn’t be prouder of you. Marco, welcome to the family. No refunds. — Your brother ♥";
  var CREDIT = "This page was lovingly built by the bride’s brother. Complaints go to the groom.";

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function confetti(el, n) {
    if (still || !el) return;
    var r = el.getBoundingClientRect(), ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    var colors = ["#C9A9A6", "#7A5656", "#E9DAD6", "#D4B08C", "#B98B87", "#F3E6E1"];
    for (var i = 0; i < n; i++) {
      var c = document.createElement("span");
      c.className = "confetti";
      var a = (-90 + (Math.random() - .5) * 150) * Math.PI / 180, v = 220 + Math.random() * 380;
      c.style.left = ox + "px"; c.style.top = oy + "px";
      c.style.background = colors[i % colors.length];
      c.style.setProperty("--dx", (Math.cos(a) * v).toFixed(0) + "px");
      c.style.setProperty("--dy", (Math.sin(a) * v).toFixed(0) + "px");
      c.style.setProperty("--rot", (Math.random() * 720 - 360).toFixed(0) + "deg");
      c.style.animationDelay = (Math.random() * .12).toFixed(2) + "s";
      if (i % 3 === 0) c.style.borderRadius = "50%";
      document.body.appendChild(c);
      (function (x) { setTimeout(function () { if (x.parentNode) x.parentNode.removeChild(x); }, 2200); })(c);
    }
  }

  function toast(msg) {
    var old = document.querySelector(".egg-toast"); if (old) old.parentNode.removeChild(old);
    var t = document.createElement("div");
    t.className = "egg-toast"; t.setAttribute("role", "status");
    t.innerHTML = "<p>" + esc(msg) + "</p>";
    t.onclick = function () { if (t.parentNode) t.parentNode.removeChild(t); };
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("is-out"); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 500); }, 6500);
  }

  var mono = $("monogram");
  if (mono) mono.addEventListener("click", function () { confetti(mono, 110); toast(MONOGRAM); });

  var credit = $("credit"); if (credit) credit.textContent = CREDIT;
})();
