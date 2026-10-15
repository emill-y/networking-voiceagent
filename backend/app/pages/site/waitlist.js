// Waitlist: join, then show your spot, invite link and friend code.
// The spot is remembered in this browser so coming back shows it again.
(function () {
  const $ = (id) => document.getElementById(id);
  const KEY = "nomi.waitlist.code";
  const params = new URLSearchParams(location.search);
  const ref = (params.get("ref") || "").trim().toUpperCase();
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* private mode */ } },
  };

  // ---------- School picker ----------
  // Type to search a list of schools (or a short name like "UCLA"); pick one
  // with the mouse or arrow keys + Enter. A school that isn't listed is kept
  // exactly as typed.
  (function schoolPicker() {
    const input = $("school");
    const list = $("school-list");
    const schools = window.NOMI_SCHOOLS || [];
    const aliases = window.NOMI_SCHOOL_ALIASES || {};
    let items = [];
    let active = -1;
    const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

    function matches(q) {
      const query = q.trim().toLowerCase();
      if (!query) return schools.slice(0, 8);
      const alias = aliases[query];
      const words = query.split(/\s+/);
      const found = schools.filter((s) => words.every((w) => s.toLowerCase().includes(w)));
      const ranked = found.sort((a, b) => a.toLowerCase().indexOf(words[0]) - b.toLowerCase().indexOf(words[0]));
      return [...(alias ? [alias] : []), ...ranked.filter((s) => s !== alias)].slice(0, 8);
    }
    function highlight(name, q) {
      const word = q.trim().split(/\s+/)[0];
      if (!word) return esc(name);
      const i = name.toLowerCase().indexOf(word.toLowerCase());
      return i < 0 ? esc(name) : esc(name.slice(0, i)) + "<mark>" + esc(name.slice(i, i + word.length)) + "</mark>" + esc(name.slice(i + word.length));
    }
    function render() {
      const q = input.value;
      items = matches(q);
      const typed = q.trim();
      const exact = items.some((s) => s.toLowerCase() === typed.toLowerCase());
      if (typed.length >= 2 && !exact) items.push({ other: typed });
      active = items.length ? 0 : -1;
      list.innerHTML = items.map((it, i) => it.other
        ? `<li role="option" id="school-opt-${i}" class="wl-other" data-i="${i}">Use “${esc(it.other)}”</li>`
        : `<li role="option" id="school-opt-${i}" data-i="${i}">${highlight(it, q)}</li>`).join("");
      mark();
      open(items.length > 0);
    }
    function mark() {
      [...list.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
      input.setAttribute("aria-activedescendant", active >= 0 ? `school-opt-${active}` : "");
      list.children[active]?.scrollIntoView({ block: "nearest" });
    }
    function open(yes) {
      list.hidden = !yes;
      input.setAttribute("aria-expanded", String(yes));
    }
    function choose(i) {
      const it = items[i];
      if (!it) return;
      input.value = it.other ?? it;
      open(false);
      $("email").focus();
    }
    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    input.addEventListener("keydown", (e) => {
      if (list.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) { render(); e.preventDefault(); return; }
      if (e.key === "ArrowDown") { active = Math.min(items.length - 1, active + 1); mark(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); mark(); e.preventDefault(); }
      else if (e.key === "Enter" && !list.hidden && active >= 0) { choose(active); e.preventDefault(); }
      else if (e.key === "Escape") open(false);
    });
    list.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li");
      if (li) { e.preventDefault(); choose(Number(li.dataset.i)); }
    });
    input.addEventListener("blur", () => setTimeout(() => {
      open(false);
      // "ucla" typed and left: store the full name.
      const alias = aliases[input.value.trim().toLowerCase()];
      if (alias) input.value = alias;
    }, 120));
  })();

  if (/^[A-Z0-9]{4,12}$/.test(ref)) {
    $("invited").hidden = false;
    $("founding").hidden = true;
    $("speech").textContent = "Yay, a friend sent you! Save your spot.";
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = Array.isArray(data.detail) ? "Please check your name, school and email." : data.detail;
      throw new Error(detail || "Something went wrong. Please try again.");
    }
    return data;
  }

  // Social proof once there's enough of it to mean something.
  api("/waitlist/stats").then(({ total }) => {
    if (total >= 25) {
      $("count").textContent = `✦ ${total.toLocaleString()} students have already joined`;
      $("count").hidden = false;
    }
  }).catch(() => {});

  function confetti() {
    const box = $("confetti");
    const colors = ["#FF6B1A", "#FFA066", "#FFD27A", "#FFF0E0", "#E2440C", "#FF8A3D"];
    for (let i = 0; i < 46; i++) {
      const p = document.createElement("i");
      const angle = Math.random() * Math.PI * 2;
      const dist = 120 + Math.random() * 160;
      p.style.background = colors[i % colors.length];
      p.style.setProperty("--x", `${Math.cos(angle) * dist}px`);
      p.style.setProperty("--y", `${Math.sin(angle) * dist - 40}px`);
      p.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
      p.style.animationDelay = `${Math.random() * 0.15}s`;
      if (i % 3 === 0) p.style.borderRadius = "50%";
      box.appendChild(p);
    }
    setTimeout(() => (box.innerHTML = ""), 1800);
  }

  function show(spot, celebrate) {
    const first = spot.name.split(" ")[0];
    $("join").hidden = true;
    $("done").hidden = false;
    $("done-title").textContent = spot.alreadyJoined ? `Welcome back, ${first}!` : `You're in, ${first}!`;
    $("position").textContent = `#${spot.position.toLocaleString()}`;
    $("of").textContent = spot.total > spot.position ? ` of ${spot.total.toLocaleString()}` : "";
    $("link").value = spot.referralUrl;
    $("friend-code").textContent = spot.friendCode;
    $("referrals").textContent = spot.referrals;
    $("friends-word").textContent = spot.referrals === 1 ? "friend has" : "friends have";
    $("speech").textContent = celebrate ? `Yay! I'll remember you, ${first}.` : `Hi again, ${first}! Invite a friend?`;

    const msg = `I just joined the Nomi waitlist, an AI that remembers everyone you meet. Get early access: ${spot.referralUrl}`;
    $("sms").href = `sms:?&body=${encodeURIComponent(msg)}`;
    $("x").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}`;
    $("li").href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(spot.referralUrl)}`;
    if (navigator.share) {
      $("native-share").hidden = false;
      $("native-share").onclick = () => navigator.share({ title: "Nomi", text: msg, url: spot.referralUrl }).catch(() => {});
    }
    store.set(spot.referralCode);

    if (celebrate) {
      const wrap = document.querySelector(".mascot-wrap");
      wrap.classList.add("party");
      confetti();
      setTimeout(() => wrap.classList.remove("party"), 2600);
    }
  }

  $("copy").addEventListener("click", async () => {
    const button = $("copy");
    try {
      await navigator.clipboard.writeText($("link").value);
    } catch {
      $("link").select();
      document.execCommand("copy");
    }
    button.textContent = "Copied!";
    setTimeout(() => { button.textContent = "Copy"; }, 1800);
  });

  $("not-me").addEventListener("click", () => {
    store.set(null);
    $("done").hidden = true;
    $("join").hidden = false;
    $("speech").textContent = "Hi! I'm Nomi. I remember everyone you meet.";
    $("name").focus();
  });

  $("join").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("name").value.trim();
    const school = $("school").value.trim();
    const email = $("email").value.trim();
    const error = $("error");
    error.hidden = true;
    if (!name || school.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      error.textContent = !name ? "Add your name." : school.length < 2 ? "Add your school." : "That email doesn't look right.";
      error.hidden = false;
      return;
    }
    const button = $("submit");
    button.disabled = true;
    button.firstElementChild.textContent = "Saving your spot…";
    try {
      const spot = await api("/waitlist/join", { name, school, email, ref: ref || undefined });
      show(spot, !spot.alreadyJoined);
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.firstElementChild.textContent = "Claim my founding spot";
    }
  });

  // Coming back: show your spot (and fresh referral count) right away.
  const saved = store.get();
  if (saved) {
    api(`/waitlist/spot/${encodeURIComponent(saved)}`).then((spot) => show({ ...spot, alreadyJoined: true }, false)).catch(() => store.set(null));
  }
})();
