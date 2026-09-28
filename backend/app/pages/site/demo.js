// Live demo: speak (browser speech recognition) or type a note, Nomi extracts
// the person on the server (/demo/extract, nothing stored), and they appear
// in the sample map. If the server is busy, a simple on-page parser stands in.
(function () {
  const $ = (id) => document.getElementById(id);
  const orb = $("orb"), mic = $("mic"), status = $("status"), words = $("words");
  const form = $("form"), text = $("text"), send = $("send"), result = $("result"), save = $("save"), card = $("card");

  const graph = new NomiGraph($("graph"), { zoom: 1, onSelect: showCard });
  NomiSample.forEach((p) => graph.addPerson(p));
  $("filter").addEventListener("input", (e) => graph.setFilter(e.target.value));

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const setStatus = (s) => { status.textContent = s; };

  // ── voice ──
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, finalText = "";

  function startListening() {
    if (!SR) {
      setStatus("Voice isn’t supported in this browser. Type your note below instead.");
      text.focus();
      return;
    }
    finalText = "";
    rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      words.innerHTML = esc(finalText) + '<span class="interim">' + esc(interim) + "</span>";
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setStatus("Microphone access was blocked. Allow it in your browser, or type below.");
      else if (e.error !== "aborted" && e.error !== "no-speech") setStatus("Couldn’t hear that. Try again, or type below.");
    };
    rec.onend = () => {
      const spoken = finalText.trim() || words.textContent.trim();
      setListening(false);
      if (spoken.length > 3) remember(spoken);
      else if (status.textContent.startsWith("Listening")) setStatus("Didn’t catch anything. Tap the orb and try again.");
    };
    try { rec.start(); setListening(true); words.textContent = ""; }
    catch { setStatus("Couldn’t start the microphone. Type below instead."); }
  }
  function stopListening() { if (rec) rec.stop(); }
  function setListening(on) {
    listening = on;
    orb.classList.toggle("listening", on);
    mic.setAttribute("aria-label", on ? "Stop" : "Start talking");
    orb.setAttribute("aria-label", on ? "Stop" : "Start talking");
    if (on) setStatus("Listening… tap again when you’re done");
  }
  const toggle = () => (listening ? stopListening() : startListening());
  mic.addEventListener("click", toggle);
  orb.addEventListener("click", toggle);
  orb.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });

  // ── typing and examples ──
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = text.value.trim();
    if (t.length > 3) { words.textContent = t; remember(t); }
  });
  text.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  document.querySelectorAll("#examples button").forEach((b) => b.addEventListener("click", () => {
    text.value = b.textContent.trim();
    words.textContent = text.value;
    remember(text.value);
  }));

  // ── extraction ──
  let busy = false;
  async function remember(note) {
    if (busy) return;
    busy = true; send.disabled = true;
    setStatus("Remembering the details…");
    orb.classList.add("listening");
    let people = null, offline = false;
    try {
      const today = new Date();
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const res = await fetch("/demo/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: note.slice(0, 800), today: iso }) });
      if (res.ok) people = (await res.json()).people.filter((p) => p.name);
      else if (res.status === 429) setStatus("You’re trying lots of notes, nice. Using the quick version for a minute.");
    } catch { /* offline: fall through */ }
    if (!people || !people.length) { people = roughParse(note); offline = true; }
    orb.classList.remove("listening");
    busy = false; send.disabled = false;
    if (!people.length) { setStatus("I couldn’t find a person in that. Try: “I met Alex at…”"); return; }

    showResult(people[0], people.length);
    let last = null;
    for (const p of people) last = graph.addPerson(withTopics(p), { spotlight: true });
    graph.focus(last);
    save.classList.add("show");
    setStatus(offline ? "Added to your map (quick mode)." : `Added ${people.length === 1 ? people[0].name : people.length + " people"} to your map.`);
    text.value = "";
  }

  // Link new people to interests already on the map ("chemical" ~ "chemistry").
  function withTopics(p) {
    const blob = [p.role, p.company, p.school, p.major, p.metAt, ...(p.projects || []), ...(p.needs || []), ...(p.topicsDiscussed || []), ...(p.interests || [])].join(" ").toLowerCase();
    const topics = new Set((p.interests || []).map((t) => t.toLowerCase()).slice(0, 4));
    for (const n of graph.nodes) if (n.kind === "topic" && blob.includes(n.name.toLowerCase().slice(0, 5))) topics.add(n.name);
    return { ...p, interests: [...topics] };
  }

  function row(label, value, hot) {
    if (!value || (Array.isArray(value) && !value.length)) return "";
    const v = Array.isArray(value) ? value.join(", ") : value;
    return `<div class="r-row${hot ? " hot" : ""}"><span>${label}</span>${esc(v)}</div>`;
  }
  function showResult(p, count) {
    result.innerHTML = `<div class="r-name">${esc(p.name)}</div>` +
      row("Role", p.role) + row("Works at", p.company) + row("School", p.school) + row("Met at", p.metAt) +
      row("Working on", p.projects) + row("Looking for", p.needs) + row("Talked about", p.topicsDiscussed) +
      row("Follow up", p.followUp ? p.followUp + (p.followUpDue ? " · " + friendlyDate(p.followUpDue) : "") : "", true) +
      (count > 1 ? `<div class="r-row"><span>Also</span>${count - 1} more ${count === 2 ? "person" : "people"} in this note</div>` : "");
    result.classList.remove("show"); void result.offsetWidth; result.classList.add("show");
  }
  function friendlyDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function showCard(p) {
    if (!p) { card.classList.remove("show"); return; }
    const line = (label, v) => (v && (!Array.isArray(v) || v.length) ? `<div class="nc-row"><span>${label}</span>${esc(Array.isArray(v) ? v.join(", ") : v)}</div>` : "");
    card.innerHTML = `<button class="nc-close" aria-label="Close">×</button>
      <div class="nc-head"><span class="nc-av" style="background:${NomiTint(p.name)}">${esc(NomiInitials(p.name))}</span>
      <div><b>${esc(p.name)}</b><small>${esc([p.role, p.company || p.school].filter(Boolean).join(" · "))}</small></div></div>` +
      line("Met at", p.metAt) + line("Working on", p.projects) + line("Looking for", p.needs) + line("Into", p.interests) + line("Follow up", p.followUp);
    card.querySelector(".nc-close").addEventListener("click", () => graph.focus(null));
    card.classList.remove("show"); void card.offsetWidth; card.classList.add("show");
  }

  // A deliberately simple stand-in for when the AI is busy.
  function roughParse(note) {
    const name = (note.match(/\b(?:[Mm]et|[Mm]eet|[Ww]ith|[Cc]hatted with|[Tt]alked to|[Cc]offee with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/) || [])[1];
    if (!name) return [];
    const at = (note.match(/\bat (?:the |a |an )?((?:[A-Z][\w'.&-]*\s?){1,4}|[a-z ]*?(?:fair|mixer|hackathon|dinner|conference|meetup|office hours|lecture|party|coffee))(?=[,.;!]|\s(?:and|who|he|she|they|today|yesterday)\b|$)/) || [])[1];
    const company = (note.match(/\b(?:works? at|working at|from|engineer at|intern(?:ing)? at)\s+([A-Z][\w&.-]+)/) || [])[1];
    const follow = (note.match(/(?:I should|I need to|remember to|I'll|I will|follow up|reach out|send|intro)[^.!?]*/i) || [])[0];
    return [{ name, company: company || null, metAt: at ? at.trim() : null, followUp: follow ? follow.trim().replace(/^./, (c) => c.toUpperCase()) : null, interests: [], projects: [], needs: [] }];
  }
})();
