// Shared behaviour for every page: menu, active link, scroll reveals and
// the session preview's clock.
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

  // Hairline under the nav once the page scrolls.
  const nav = document.querySelector(".nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // Close the phone menu after choosing a link.
  if (links) links.addEventListener("click", (e) => {
    if (e.target.closest("a")) { links.classList.remove("open"); menu && menu.setAttribute("aria-expanded", "false"); }
  });

  // The session preview: a steady clock.
  const timer = document.getElementById("timer");
  if (timer) {
    let seconds = 42 * 60 + 18;
    setInterval(() => {
      seconds += 1;
      const m = Math.floor(seconds / 60), s = seconds % 60;
      timer.textContent = `${m}:${String(s).padStart(2, "0")}`;
    }, 1000);
  }
})();

// Invite links (/?invite=CODE): remember the code so the app can credit the
// friend who invited you after you sign up.
(function () {
  try {
    var code = new URLSearchParams(location.search).get("invite");
    if (code && /^[a-z0-9]{4,40}$/i.test(code)) localStorage.setItem("nomi.invite", code.toLowerCase());
  } catch (e) {}
})();
