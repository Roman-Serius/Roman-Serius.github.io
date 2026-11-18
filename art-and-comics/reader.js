// A tiny comic reader: one page at a time, with buttons, arrow keys,
// tap-the-page to go forward, and swipes on phones. The page number is kept
// in the address (#murmurations-3) so a page can be linked to.
(function () {
  document.querySelectorAll(".reader[data-comic]").forEach((reader) => {
    const id = reader.dataset.comic;
    const comic = (window.COMICS || {})[id];
    if (!comic || !comic.pages || !comic.pages.length) return;   // keep the cover

    const img = reader.querySelector(".page-img");
    const prev = reader.querySelector(".prev");
    const next = reader.querySelector(".next");
    const count = reader.querySelector(".count");
    reader.querySelector(".controls").hidden = false;
    reader.querySelector(".placeholder").hidden = true;

    const total = comic.pages.length;
    // a page is either "01.jpg" or { src: "01.jpg", alt: "what's on it" }
    const page = (n) => (typeof comic.pages[n] === "string" ? { src: comic.pages[n] } : comic.pages[n]);
    const fromHash = () => {
      const m = location.hash.match(new RegExp("^#" + id + "-(\\d+)$"));
      return m ? Math.min(Math.max(parseInt(m[1], 10), 1), total) - 1 : 0;
    };
    let i = fromHash();

    function show(n, scroll) {
      i = Math.min(Math.max(n, 0), total - 1);
      const pg = page(i);
      img.src = comic.folder + pg.src;
      img.alt = `${comic.alt} ${i + 1} of ${total}` + (pg.alt ? `: ${pg.alt}` : "");
      count.textContent = `Page ${i + 1} / ${total}`;
      prev.disabled = i === 0;
      next.disabled = i === total - 1;
      history.replaceState(null, "", `#${id}-${i + 1}`);
      // preload the next page
      if (i + 1 < total) new Image().src = comic.folder + page(i + 1).src;
      if (scroll) reader.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    prev.addEventListener("click", () => show(i - 1, true));
    next.addEventListener("click", () => show(i + 1, true));
    img.addEventListener("click", () => show(i + 1 < total ? i + 1 : 0, true));
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, textarea")) return;
      if (e.key === "ArrowRight") show(i + 1);
      if (e.key === "ArrowLeft") show(i - 1);
    });
    let x0 = null;
    img.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    img.addEventListener("touchend", (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) show(dx < 0 ? i + 1 : i - 1);
      x0 = null;
    });
    show(i);
  });
})();
