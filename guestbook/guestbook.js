// romanserius.com guestbook: newspaper look by default, with a "90s mode"
// button that turns it into a 1998 GeoCities guestbook (html.y90). Entries live in Supabase (schema
// "guestbook", see supabase/schema.sql), in the same project as Haikudle. All
// rules are checked again on the server; the checks here are only for quick
// feedback.
(function () {
  // Public values, the same ones Haikudle uses (daily-games/haikudle/config.js).
  // Never put the database password or a service_role key here.
  const CFG = {
    url: "https://tmitjoctttzeikxpyljg.supabase.co",
    key: "sb_publishable_UsL9Zcjtbdenk6vzHrQs7Q_Psgq1rRi",
    turnstile: "0x4AAAAAAF-nt_e42HwaP1u7",
    goatcounter: "https://roman-serius.goatcounter.com",
  };
  const PAGE = 20;
  const MAX = 600;

  const $ = (id) => document.getElementById(id);
  const list = $("letters");
  const more = $("more");
  let oldestId = null;
  let total = null;      // how many entries exist, for "Entry #12"
  let shown = 0;         // how many are on the page

  const is90s = () => document.documentElement.classList.contains("y90");
  const setTally = (fill) => document.querySelectorAll("[data-tally]").forEach(fill);
  let counted = false;
  function syncMode() {
    const on = is90s();
    $("modeBtn").setAttribute("aria-pressed", on ? "true" : "false");
    document.title = on ? "~*~ Sign My Guestbook! ~*~ Soren Marius" : "Guestbook · Soren Marius";
    if (on && !counted) { counted = true; hitCounter(); }
  }
  $("modeBtn").addEventListener("click", () => {
    document.documentElement.classList.toggle("y90");
    try { localStorage.setItem("rs:guestbook:mode", is90s() ? "90s" : "paper"); } catch {}
    if (location.hash === "#90s") history.replaceState(null, "", location.pathname);
    syncMode();
  });
  syncMode();

  if (!window.supabase) {
    setTally((t) => { t.textContent = "The guestbook couldn't load. Refresh to try again."; });
    return;
  }
  // Same project + same domain as Haikudle, so the sign-in is shared.
  const sb = window.supabase.createClient(CFG.url, CFG.key);
  const db = sb.schema("guestbook");

  // ---------- helpers ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;   // always text, never HTML
    return e;
  }
  function setStatus(msg, isError) {
    $("status").textContent = msg || "";
    $("status").classList.toggle("error", !!isError);
  }
  // "Tuesday, November 17, 2026 at 4:36 PM", like the guestbook scripts used to print
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) +
      " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };
  function friendly(err) {
    const m = (err && err.message) || String(err);
    if (/schema must be one of|Invalid schema/i.test(m)) return "Setup needed: add \"guestbook\" to Exposed schemas in Supabase (Project Settings → Data API).";
    if (/Could not find the function|does not exist/i.test(m)) return "Setup needed: run guestbook/supabase/schema.sql in the Supabase SQL Editor.";
    if (/captcha/i.test(m)) return "The human check didn't go through. Refresh the page to try again.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Couldn't reach the guestbook. Check your connection and try again.";
    return m;
  }
  function safeUrl(u) {
    try {
      const url = new URL(u);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch { return null; }
  }
  // a bit of text that reads differently in each mode
  function two(paper, nineties) {
    const f = document.createDocumentFragment();
    f.append(el("span", "np-only", paper), el("span", "y90-only", nineties));
    return f;
  }
  function row(table, label, valueNode, cls) {
    const tr = el("tr", cls);
    const k = el("td", "k");
    if (typeof label === "string") k.textContent = label; else k.appendChild(label);
    tr.appendChild(k);
    const td = el("td");
    if (typeof valueNode === "string") td.textContent = valueNode; else td.appendChild(valueNode);
    tr.appendChild(td);
    table.appendChild(tr);
    return td;
  }
  function updateTally() {
    if (total == null) return;
    setTally((t) => {
      t.replaceChildren();
      if (total === 0) { t.append(two("No letters yet. You could be the first.", "Nobody has signed yet. Be the first!!")); return; }
      t.append(two(`${total} ${total === 1 ? "letter" : "letters"}`, ""));
      const y = el("span", "y90-only");
      y.append("There ", total === 1 ? "is " : "are ", el("b", null, String(total)), total === 1 ? " entry" : " entries", " in my guestbook. Thanx everybody!");
      t.append(y);
    });
  }
  function numLabel(n) {
    return two(n ? `No. ${n}` : "New", n ? `Entry #${n}` : "Entry");
  }

  // ---------- reading ----------
  function entry(e, num, isNew) {
    const t = el("table", "entry" + (isNew ? " new" : ""));
    t.dataset.id = e.id;
    const head = el("tr"); const th = el("th"); th.colSpan = 2;
    const numEl = el("span", "num"); numEl.appendChild(numLabel(num));
    th.append(numEl, el("span", "y90-only", " — "), e.name);
    head.appendChild(th); t.appendChild(head);

    const href = e.website && safeUrl(e.website);
    if (href) {
      const a = el("a", null, href.replace(/^https?:\/\//, "").replace(/\/$/, ""));
      a.href = href; a.rel = "nofollow ugc noopener"; a.target = "_blank";
      row(t, "Homepage:", a);
    }
    if (e.place) row(t, "From:", e.place);
    if (e.found_via) row(t, "Found me via:", e.found_via);
    row(t, "Comments:", e.message, "c").classList.add("msg");

    const posted = el("span", "posted", "Signed on " + fmtDate(e.created_at));
    if (e.mine) {
      const del = el("button", null, "delete mine");
      del.type = "button";
      del.addEventListener("click", () => removeMine(e.id, t));
      posted.append(" · ", del);
    }
    const pr = el("tr"); const pd = el("td"); pd.colSpan = 2; pd.appendChild(posted); pr.appendChild(pd); t.appendChild(pr);

    if (e.reply) row(t, two("Reply", "Webmaster's reply:"), e.reply, "reply").classList.add("msg");
    return t;
  }

  async function loadTotal() {
    const { data, error } = await db.rpc("entry_count");
    if (!error && data != null) total = Number(data);
    updateTally();
  }

  async function loadPage(first) {
    more.disabled = true;
    const { data, error } = await db.rpc("list_entries", { p_before: first ? null : oldestId, p_limit: PAGE });
    more.disabled = false;
    if (error) {
      if (first) setTally((t) => { t.textContent = friendly(error); });
      else setStatus(friendly(error), true);
      return;
    }
    if (first && !data.length) { const p = el("p", "empty"); p.appendChild(two("No letters yet. You could be the first.", "Nobody has signed yet. Be the first!!")); list.appendChild(p); }
    data.forEach((e) => {
      list.appendChild(entry(e, total != null ? total - shown : null));
      shown++;
    });
    if (data.length) oldestId = data[data.length - 1].id;
    more.hidden = data.length < PAGE;
  }

  async function removeMine(id, node) {
    if (!confirmDelete()) return;
    const { data, error } = await db.rpc("remove_mine", { p_id: id });
    if (error || !data) { setStatus(error ? friendly(error) : "Couldn't delete that one.", true); return; }
    node.remove();
    renumber();
  }
  // a plain two-click confirm instead of a browser dialog
  let armed = null;
  function confirmDelete() {
    const now = Date.now();
    if (armed && now - armed < 4000) { armed = null; setStatus(""); return true; }
    armed = now;
    setStatus("Click “delete mine” again to remove it.");
    $("sign").scrollIntoView({ block: "nearest" });
    return false;
  }
  // after a delete or a new entry, start counting again from the top
  async function renumber() {
    await loadTotal();
    shown = 0;
    list.querySelectorAll(".entry").forEach((t) => {
      const n = t.querySelector(".num");
      if (n && total != null) n.replaceChildren(numLabel(total - shown));
      shown++;
    });
  }

  // ---------- signing in (only when someone signs) ----------
  function captcha() {
    if (!CFG.turnstile) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const started = Date.now();
      let errors = 0;
      const ready = () => {
        if (!window.turnstile) {
          if (Date.now() - started > 15000) return reject(new Error("Couldn't load the human check. Refresh to try again."));
          return setTimeout(ready, 100);
        }
        window.turnstile.render($("captcha"), {
          sitekey: CFG.turnstile,
          appearance: "interaction-only",
          callback: (token) => { $("captcha").replaceChildren(); resolve(token); },
          "error-callback": () => {
            errors++;
            if (errors >= 3) reject(new Error("The human check failed. Refresh to try again."));
          },
        });
      };
      ready();
    });
  }
  async function ensureSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) return;
    const captchaToken = await captcha();
    const { error } = await sb.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
    if (error) throw error;
  }

  // ---------- the form ----------
  const msg = $("message");
  function updateCount() {
    const left = MAX - msg.value.length;
    $("count").textContent = `${left} characters left`;
    $("count").classList.toggle("over", left < 0);
  }
  msg.addEventListener("input", updateCount);
  updateCount();

  document.querySelectorAll("[data-smiley]").forEach((b) => b.addEventListener("click", () => {
    const s = b.dataset.smiley;
    const at = msg.selectionStart ?? msg.value.length;
    const pad = at > 0 && !/\s$/.test(msg.value.slice(0, at)) ? " " : "";
    msg.value = msg.value.slice(0, at) + pad + s + " " + msg.value.slice(msg.selectionEnd ?? at);
    msg.focus();
    msg.selectionStart = msg.selectionEnd = at + pad.length + s.length + 1;
    updateCount();
  }));
  $("sign").addEventListener("reset", () => setTimeout(() => { updateCount(); setStatus(""); }, 0));

  // remember name / homepage / town for next time (this browser only)
  const SAVED = "rs:guestbook:me";
  try {
    const me = JSON.parse(localStorage.getItem(SAVED) || "{}");
    ["name", "place", "website"].forEach((k) => { if (me[k]) $(k).value = me[k]; });
  } catch {}

  $("sign").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if ($("hp").value) return;                       // a bot
    const name = $("name").value.trim();
    const place = $("place").value.trim();
    let website = $("website").value.trim();
    if (website === "http://" || website === "https://") website = "";
    const found = $("found").value;
    const message = msg.value.trim();
    if (!name) { setStatus(is90s() ? "Please type in your name!" : "Please add your name.", true); $("name").focus(); return; }
    if (!message) { setStatus(is90s() ? "Please leave a comment!" : "Please write a note.", true); msg.focus(); return; }
    if (message.length > MAX) { setStatus(`Comments can be up to ${MAX} characters.`, true); return; }

    const btn = $("submit");
    btn.disabled = true;
    setStatus(is90s() ? "Signing… please wait…" : "Posting…");
    try {
      await ensureSession();
      const { error } = await db.rpc("sign", {
        p_name: name, p_message: message,
        p_place: place || null, p_website: website || null, p_found_via: found || null,
      });
      if (error) throw error;
      try { localStorage.setItem(SAVED, JSON.stringify({ name, place, website })); } catch {}
      msg.value = ""; $("found").value = "";
      updateCount();
      setStatus(is90s() ? "Thanx for signing my guestbook!!! :)" : "Thanks for signing!");
      const { data } = await db.rpc("list_entries", { p_before: null, p_limit: 1 });
      const empty = list.querySelector(".empty"); if (empty) empty.remove();
      if (data && data[0]) list.prepend(entry(data[0], null, true));
      await renumber();
      list.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setStatus(friendly(e), true);
    } finally {
      btn.disabled = false;
    }
  });

  more.addEventListener("click", () => loadPage(false));
  $("linkcode").addEventListener("focus", (e) => e.target.select());

  (async () => { await loadTotal(); await loadPage(true); })();

  // ---------- hit counter ----------
  // Uses GoatCounter's public counter. It only works once "Allow adding
  // visitor counts on your website" is ticked in GoatCounter's settings;
  // until then the counter stays hidden.
  async function hitCounter() {
    try {
      const r = await fetch(`${CFG.goatcounter}/counter/${encodeURIComponent(location.pathname)}.json`);
      if (!r.ok) return;
      const j = await r.json();
      const n = String(j.count || "").replace(/\D/g, "");
      if (!n) return;
      const digits = $("digits");
      n.padStart(6, "0").split("").forEach((d) => digits.appendChild(el("span", null, d)));
      $("countText").textContent = Number(n).toLocaleString("en-US");
      $("counter").hidden = false;
    } catch {}
  }
})();
