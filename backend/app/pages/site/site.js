// Shared behaviour for every page: menu, active link, scroll reveals,
// the typing transcript in the hero and the small maps.
(function () {
  const menu = document.querySelector(".menu-btn");
  const links = document.querySelector(".nav-links");
  if (menu && links) {
    menu.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      menu.setAttribute("aria-expanded", String(open));
    });
  }
  const here = location.pathname.replace(/\/$/, "").replace(/\.html$/, "") || "/";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page");
  });

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // Hero: a note being spoken, word by word, on a loop.
  const live = document.querySelector("[data-typing]");
  if (live) {
    const lines = JSON.parse(live.getAttribute("data-typing"));
    let line = 0;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const play = () => {
      const words = lines[line].split(" ");
      let i = 0;
      const step = () => {
        live.innerHTML = words.slice(0, i).join(" ") + ' <span class="dim">' + words.slice(i).join(" ") + "</span>";
        if (i++ < words.length) setTimeout(step, still ? 0 : 170);
        else setTimeout(() => { line = (line + 1) % lines.length; play(); }, 2600);
      };
      step();
    };
    play();
  }

  // Small decorative maps (home teaser, product page).
  document.querySelectorAll("canvas[data-mini-graph]").forEach((canvas) => {
    if (!window.NomiGraph) return;
    const g = new NomiGraph(canvas, { zoom: Number(canvas.dataset.zoom || 0.95) });
    window.NomiSample.forEach((p) => g.addPerson(p));
  });
})();

// Invite links (/?invite=CODE): remember the code so the app can credit the
// friend who invited you after you sign up.
(function () {
  try {
    var code = new URLSearchParams(location.search).get("invite");
    if (code && /^[a-z0-9]{4,40}$/i.test(code)) localStorage.setItem("nomi.invite", code.toLowerCase());
  } catch (e) {}
})();
