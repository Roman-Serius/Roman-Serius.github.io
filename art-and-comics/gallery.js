// Click a painting to see it big. Click anywhere or press Escape to close.
// Without JavaScript the link just opens the image on its own.
(function () {
  let box = null, lastFocus = null;
  function close() {
    if (!box) return;
    box.remove(); box = null;
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }
  document.querySelectorAll(".piece a.zoom").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      lastFocus = a;
      const img = a.querySelector("img");
      const title = a.closest(".piece").querySelector("figcaption");
      box = document.createElement("div");
      box.className = "lightbox";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-label", title ? title.textContent : "Painting");
      box.tabIndex = -1;
      const big = document.createElement("img");
      big.src = a.href;
      big.alt = img.alt;
      box.appendChild(big);
      if (title) { const p = document.createElement("p"); p.textContent = title.textContent; box.appendChild(p); }
      box.addEventListener("click", close);
      document.body.appendChild(box);
      document.body.style.overflow = "hidden";
      box.focus();
    });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
})();
