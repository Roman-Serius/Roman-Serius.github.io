// romanserius.com guestbook. Entries live in Supabase (schema "guestbook",
// see supabase/schema.sql), in the same project as Haikudle. All rules are
// checked again on the server; the checks here are only for quick feedback.
(function () {
  // Public values, the same ones Haikudle uses (daily-games/haikudle/config.js).
  // Never put the database password or a service_role key here.
  const CFG = {
    url: "https://tmitjoctttzeikxpyljg.supabase.co",
    key: "sb_publishable_UsL9Zcjtbdenk6vzHrQs7Q_Psgq1rRi",
    turnstile: "0x4AAAAAAF-nt_e42HwaP1u7",
  };
  const PAGE = 30;
  const MAX = 600;

  const $ = (id) => document.getElementById(id);
  const list = $("letters");
  const more = $("more");
  let oldestId = null;

  if (!window.supabase) {
    list.replaceChildren(note("The guestbook couldn't load. Refresh to try again."));
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
  function note(text) { return el("p", "empty", text); }
  function setStatus(msg, isError) {
    $("status").textContent = msg || "";
    $("status").classList.toggle("error", !!isError);
  }
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

  // ---------- reading ----------
  function letter(e, isNew) {
    const art = el("article", "letter" + (isNew ? " new" : ""));
    art.dataset.id = e.id;
    art.appendChild(el("p", null, e.message));

    const sig = el("p", "sig", "— ");
    const href = e.website && safeUrl(e.website);
    if (href) {
      const a = el("a", null, e.name);
      a.href = href;
      a.rel = "nofollow ugc noopener";
      a.target = "_blank";
      sig.appendChild(a);
    } else {
      sig.appendChild(document.createTextNode(e.name));
    }
    if (e.place) sig.appendChild(document.createTextNode(", " + e.place));
    art.appendChild(sig);

    const meta = el("div", "meta");
    meta.appendChild(el("time", null, fmtDate(e.created_at)));
    if (e.mine) {
      const del = el("button", null, "delete mine");
      del.type = "button";
      del.addEventListener("click", () => removeMine(e.id, art));
      meta.appendChild(del);
    } else {
      meta.appendChild(el("span"));
    }
    art.appendChild(meta);
    return art;
  }

  async function loadPage(first) {
    more.disabled = true;
    const { data, error } = await db.rpc("list_entries", { p_before: first ? null : oldestId, p_limit: PAGE });
    more.disabled = false;
    if (error) {
      if (first) list.replaceChildren(note(friendly(error)));
      else setStatus(friendly(error), true);
      return;
    }
    if (first) list.replaceChildren();
    if (first && !data.length) list.appendChild(note("No letters yet. You could be the first."));
    data.forEach((e) => list.appendChild(letter(e)));
    if (data.length) oldestId = data[data.length - 1].id;
    more.hidden = data.length < PAGE;
  }

  async function loadTotal() {
    const { data, error } = await db.rpc("entry_count");
    if (!error && data != null) $("total").textContent = `${data} ${data === 1 ? "letter" : "letters"}`;
  }

  async function removeMine(id, node) {
    if (!confirmDelete()) return;
    const { data, error } = await db.rpc("remove_mine", { p_id: id });
    if (error || !data) { setStatus(error ? friendly(error) : "Couldn't delete that one.", true); return; }
    node.remove();
    loadTotal();
    if (!list.querySelector(".letter")) list.replaceChildren(note("No letters yet. You could be the first."));
  }
  // A plain two-click confirm instead of a browser dialog.
  let armed = null;
  function confirmDelete() {
    const now = Date.now();
    if (armed && now - armed < 4000) { armed = null; setStatus(""); return true; }
    armed = now;
    setStatus("Click “delete mine” again to remove your letter.");
    return false;
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
    $("count").textContent = `${left} left`;
    $("count").classList.toggle("over", left < 0);
  }
  msg.addEventListener("input", updateCount);
  updateCount();

  // Remember the name/from/website for next time (this browser only).
  const SAVED = "rs:guestbook:me";
  try {
    const me = JSON.parse(localStorage.getItem(SAVED) || "{}");
    ["name", "place", "website"].forEach((k) => { if (me[k]) $(k).value = me[k]; });
  } catch {}

  $("form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if ($("hp").value) return;                       // a bot
    const name = $("name").value.trim();
    const place = $("place").value.trim();
    const website = $("website").value.trim();
    const message = msg.value.trim();
    if (!name) { setStatus("Please add your name.", true); $("name").focus(); return; }
    if (!message) { setStatus("Please write a message.", true); msg.focus(); return; }
    if (message.length > MAX) { setStatus(`Messages can be up to ${MAX} characters.`, true); return; }

    const btn = $("submit");
    btn.disabled = true;
    setStatus("Posting…");
    try {
      await ensureSession();
      const { error } = await db.rpc("sign", {
        p_name: name, p_message: message,
        p_place: place || null, p_website: website || null,
      });
      if (error) throw error;
      try { localStorage.setItem(SAVED, JSON.stringify({ name, place, website })); } catch {}
      msg.value = "";
      updateCount();
      setStatus("Thanks for signing!");
      // Show the new letter at the top.
      const { data } = await db.rpc("list_entries", { p_before: null, p_limit: 1 });
      const first = list.querySelector(".empty");
      if (first) first.remove();
      if (data && data[0]) list.prepend(letter(data[0], true));
      loadTotal();
    } catch (e) {
      setStatus(friendly(e), true);
    } finally {
      btn.disabled = false;
    }
  });

  more.addEventListener("click", () => loadPage(false));

  loadPage(true);
  loadTotal();
})();
