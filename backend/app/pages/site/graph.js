// A living, Obsidian-style map of people and what connects them.
// People are the bright nodes; events, companies/schools and shared interests
// are the small nodes they hang from. Drag, zoom, hover and click.
(function () {
  const TINTS = ["#ff8a3d", "#ffb37f", "#f2643a", "#ffd29d", "#e8866a", "#c9a0ff", "#7fc8ff", "#8fe3b0"];
  const KIND = {
    event: { color: "#ff6b1a", r: 4.5, label: "Event" },
    org: { color: "#ffd8bd", r: 4, label: "Company / school" },
    topic: { color: "#9b8aa8", r: 3.2, label: "Interest" },
  };

  function tintFor(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return TINTS[h % TINTS.length];
  }
  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  }
  const norm = (s) => (s || "").trim().toLowerCase();

  class NomiGraph {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.onSelect = options.onSelect || (() => {});
      this.labels = options.labels !== false;
      this.nodes = [];
      this.links = [];
      this.byKey = new Map();
      this.view = { x: 0, y: 0, k: options.zoom || 1 };
      this.hover = null;
      this.selected = null;
      this.filter = "";
      this.pointers = new Map();
      this.still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.resize();
      new ResizeObserver(() => this.resize()).observe(canvas);
      this.bind();
      this.alpha = 1;
      const loop = () => { this.tick(); this.draw(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = this.canvas.getBoundingClientRect();
      this.w = width; this.h = height;
      this.canvas.width = Math.max(1, width * dpr);
      this.canvas.height = Math.max(1, height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── data ──
    node(key, props) {
      if (this.byKey.has(key)) return this.byKey.get(key);
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 120;
      const n = { key, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, vx: 0, vy: 0, born: performance.now(), degree: 0, ...props };
      this.nodes.push(n);
      this.byKey.set(key, n);
      return n;
    }
    link(a, b) {
      if (this.links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return;
      this.links.push({ a, b });
      a.degree++; b.degree++;
    }
    addPerson(p, { spotlight = false } = {}) {
      const person = this.node("p:" + norm(p.name) + ":" + this.nodes.length, {
        kind: "person", name: p.name, person: p, color: tintFor(p.name), initials: initials(p.name),
      });
      if (spotlight) { person.x = (Math.random() - 0.5) * 40; person.y = (Math.random() - 0.5) * 40; person.spot = performance.now(); }
      const hang = (kind, label) => {
        if (!label) return;
        const tag = this.node(kind + ":" + norm(label), { kind, name: label, color: KIND[kind].color });
        if (spotlight && tag.degree === 0) { tag.x = person.x + (Math.random() - 0.5) * 60; tag.y = person.y + (Math.random() - 0.5) * 60; }
        this.link(person, tag);
      };
      hang("event", p.metAt);
      hang("org", p.company);
      hang("org", p.school);
      for (const t of p.interests || []) hang("topic", t);
      this.alpha = 1;
      return person;
    }
    neighbors(n) {
      const set = new Set([n]);
      for (const l of this.links) { if (l.a === n) set.add(l.b); if (l.b === n) set.add(l.a); }
      return set;
    }
    matches(n) {
      if (!this.filter) return true;
      const q = this.filter;
      if (n.kind !== "person") return norm(n.name).includes(q);
      const p = n.person;
      return [p.name, p.company, p.role, p.school, p.metAt, ...(p.interests || []), ...(p.projects || []), ...(p.needs || [])]
        .some((v) => norm(v).includes(q));
    }
    setFilter(q) { this.filter = norm(q); }
    focus(n) { this.selected = n; this.onSelect(n && n.kind === "person" ? n.person : null, n); }

    // ── physics ──
    tick() {
      if (this.still && this.alpha < 0.02) return;
      const N = this.nodes;
      const a = Math.max(this.alpha, 0.03);
      for (let i = 0; i < N.length; i++) {
        const n = N[i];
        for (let j = i + 1; j < N.length; j++) {
          const m = N[j];
          let dx = n.x - m.x, dy = n.y - m.y;
          let d2 = dx * dx + dy * dy || 0.01;
          if (d2 > 90000) continue;
          const f = (n.kind === "person" && m.kind === "person" ? 1400 : 700) / d2;
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          n.vx += dx * f * a; n.vy += dy * f * a;
          m.vx -= dx * f * a; m.vy -= dy * f * a;
        }
      }
      for (const l of this.links) {
        const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const rest = l.b.kind === "topic" || l.a.kind === "topic" ? 55 : 70;
        const f = (d - rest) * 0.02 * a;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        l.a.vx += fx; l.a.vy += fy; l.b.vx -= fx; l.b.vy -= fy;
      }
      const t = performance.now() / 1000;
      for (const n of N) {
        n.vx -= n.x * 0.0025 * a; n.vy -= n.y * 0.0025 * a;
        if (!this.still) { n.vx += Math.sin(t * 0.6 + n.x * 0.01) * 0.006; n.vy += Math.cos(t * 0.5 + n.y * 0.01) * 0.006; }
        if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
      }
      this.alpha *= 0.995;
    }

    // ── drawing ──
    toScreen(n) { return [this.w / 2 + (n.x + this.view.x) * this.view.k, this.h / 2 + (n.y + this.view.y) * this.view.k]; }
    toWorld(sx, sy) { return [(sx - this.w / 2) / this.view.k - this.view.x, (sy - this.h / 2) / this.view.k - this.view.y]; }
    radius(n) {
      const base = n.kind === "person" ? 6.5 + Math.min(n.degree, 6) * 0.9 : KIND[n.kind].r + Math.min(n.degree, 8) * 0.55;
      const grow = Math.min(1, (performance.now() - n.born) / 600);
      return base * (0.2 + 0.8 * (1 - Math.pow(1 - grow, 3)));
    }
    draw() {
      const { ctx, w, h } = this;
      ctx.clearRect(0, 0, w, h);
      const focus = this.hover || this.selected;
      const near = focus ? this.neighbors(focus) : null;
      const k = this.view.k;

      ctx.lineWidth = 1;
      for (const l of this.links) {
        const lit = near && near.has(l.a) && near.has(l.b) && (l.a === focus || l.b === focus);
        const hidden = (near && !lit) || (this.filter && !(this.matches(l.a) || this.matches(l.b)));
        const [x1, y1] = this.toScreen(l.a), [x2, y2] = this.toScreen(l.b);
        ctx.strokeStyle = lit ? "rgba(255,138,61,0.75)" : hidden ? "rgba(255,200,170,0.04)" : "rgba(255,200,170,0.13)";
        ctx.lineWidth = lit ? 1.6 : 1;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }

      const now = performance.now();
      for (const n of this.nodes) {
        const [x, y] = this.toScreen(n);
        if (x < -40 || y < -40 || x > w + 40 || y > h + 40) continue;
        const r = this.radius(n) * Math.sqrt(k);
        const dim = (near && !near.has(n)) || (this.filter && !this.matches(n));
        ctx.globalAlpha = dim ? 0.14 : 1;
        if (n.spot && now - n.spot < 4000) {
          const p = ((now - n.spot) % 1300) / 1300;
          ctx.strokeStyle = `rgba(255,138,61,${0.7 * (1 - p)})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, r + 4 + p * 26, 0, Math.PI * 2); ctx.stroke();
        }
        if (n.kind === "person") {
          ctx.shadowColor = n.color; ctx.shadowBlur = n === focus ? 28 : 14;
          const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
          g.addColorStop(0, "#fff3e6"); g.addColorStop(0.35, n.color); g.addColorStop(1, shade(n.color));
          ctx.fillStyle = g;
        } else {
          ctx.shadowBlur = 0;
          ctx.fillStyle = n.color;
        }
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (n === this.selected) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke(); }

        const showLabel = this.labels && (n.kind === "person" || k > 1.25 || (near && near.has(n)) || (this.filter && this.matches(n)));
        if (showLabel && !dim) {
          ctx.font = n.kind === "person" ? `600 ${12.5}px Inter, system-ui, sans-serif` : `500 ${11}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = n.kind === "person" ? "rgba(255,246,238,0.92)" : "rgba(255,225,205,0.55)";
          ctx.fillText(n.name, x, y + r + 14);
        }
        ctx.globalAlpha = 1;
      }
    }

    // ── interaction ──
    hit(sx, sy) {
      const [wx, wy] = this.toWorld(sx, sy);
      let best = null, bestD = Infinity;
      for (const n of this.nodes) {
        const d = Math.hypot(n.x - wx, n.y - wy);
        const reach = (this.radius(n) + 8) / Math.sqrt(this.view.k);
        if (d < reach && d < bestD) { best = n; bestD = d; }
      }
      return best;
    }
    bind() {
      const c = this.canvas;
      const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      let drag = null, pan = null, moved = 0, pinch = null;

      c.addEventListener("pointerdown", (e) => {
        c.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, pos(e));
        moved = 0;
        if (this.pointers.size === 2) {
          const [p1, p2] = [...this.pointers.values()];
          pinch = { d: Math.hypot(p1[0] - p2[0], p1[1] - p2[1]), k: this.view.k };
          if (drag) { drag.fixed = false; drag = null; }
          pan = null;
          return;
        }
        const [sx, sy] = pos(e);
        const n = this.hit(sx, sy);
        if (n) { drag = n; n.fixed = true; this.alpha = Math.max(this.alpha, 0.5); }
        else pan = { sx, sy, x: this.view.x, y: this.view.y };
        c.classList.add("dragging");
      });
      c.addEventListener("pointermove", (e) => {
        const [sx, sy] = pos(e);
        if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, [sx, sy]);
        if (pinch && this.pointers.size === 2) {
          const [p1, p2] = [...this.pointers.values()];
          const d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
          this.view.k = clamp(pinch.k * (d / pinch.d), 0.4, 3);
          return;
        }
        if (drag) {
          moved++;
          const [wx, wy] = this.toWorld(sx, sy);
          drag.x = wx; drag.y = wy;
        } else if (pan) {
          moved++;
          this.view.x = pan.x + (sx - pan.sx) / this.view.k;
          this.view.y = pan.y + (sy - pan.sy) / this.view.k;
        } else {
          const n = this.hit(sx, sy);
          this.hover = n;
          c.style.cursor = n ? "pointer" : "grab";
        }
      });
      const end = (e) => {
        this.pointers.delete(e.pointerId);
        if (this.pointers.size < 2) pinch = null;
        c.classList.remove("dragging");
        if (drag) {
          drag.fixed = false;
          if (moved < 4) this.focus(drag);
          drag = null;
        } else if (pan) {
          if (moved < 4) this.focus(null);
          pan = null;
        }
      };
      c.addEventListener("pointerup", end);
      c.addEventListener("pointercancel", end);
      c.addEventListener("pointerleave", () => { if (!drag && !pan) this.hover = null; });
      c.addEventListener("wheel", (e) => {
        e.preventDefault();
        const [sx, sy] = pos(e);
        const [wx, wy] = this.toWorld(sx, sy);
        this.view.k = clamp(this.view.k * Math.exp(-e.deltaY * 0.0015), 0.4, 3);
        const [nx, ny] = this.toWorld(sx, sy);
        this.view.x += nx - wx; this.view.y += ny - wy;
      }, { passive: false });
    }
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.round(c * 0.45).toString(16).padStart(2, "0");
    return "#" + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
  }

  // A small sample network so the map is alive before you add anyone.
  const SAMPLE = [
    { name: "Jason Chen", role: "Founder", company: "Loop Robotics", school: "UC Berkeley", metAt: "Cal Hacks", interests: ["robotics", "startups"], projects: ["warehouse robots"], needs: ["designers"], followUp: "Intro him to Sam" },
    { name: "Maya Singh", role: "Product Manager", company: "Stripe", metAt: "Stripe dinner", interests: ["fintech", "climbing"], projects: ["checkout for creators"], followUp: "Send the deck" },
    { name: "Priya Shah", role: "Software Engineer", company: "Figma", metAt: "Career fair", interests: ["design tools"], needs: ["interns"], followUp: "Send my resume" },
    { name: "Diego Alvarez", role: "Chemical engineering PhD", school: "Stanford", metAt: "Founders mixer", interests: ["chemistry", "climate", "startups"], projects: ["battery materials"], needs: ["a cofounder"] },
    { name: "Aisha Bello", role: "University recruiter", company: "Google", metAt: "Career fair", interests: ["mentoring"] },
    { name: "Sam Park", role: "Product designer", company: "Figma", metAt: "Cal Hacks", interests: ["typography", "design tools"] },
    { name: "Lena Novak", role: "Seed investor", company: "Northwind Ventures", metAt: "Founders mixer", interests: ["climate", "robotics"] },
    { name: "Omar Haddad", role: "TA, CS 161", school: "UC Berkeley", metAt: "Office hours", interests: ["security"] },
    { name: "Grace Liu", role: "Biotech founder", company: "Benchline Bio", metAt: "Founders mixer", interests: ["chemistry", "biotech", "startups"], projects: ["lab automation"] },
    { name: "Noah Kim", role: "ML engineer", company: "Stripe", metAt: "Stripe dinner", interests: ["machine learning"] },
    { name: "Zoe Martin", role: "President, Entrepreneurs Club", school: "UC Berkeley", metAt: "Club fair", interests: ["startups"] },
    { name: "Ethan Brooks", role: "Classmate · Chemistry major", school: "UC Berkeley", metAt: "Chem 3A lecture", interests: ["chemistry", "climbing"] },
  ];

  window.NomiGraph = NomiGraph;
  window.NomiSample = SAMPLE;
  window.NomiTint = tintFor;
  window.NomiInitials = initials;
  window.NomiKinds = KIND;
})();
