/* Pastor Bola Akinlabi — site behaviour. Vanilla JS, no dependencies.
   In WordPress this is enqueued as-is from functions.php. */
(() => {
  const doc = document.documentElement;
  doc.classList.add("js");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Header: compact on scroll ------------------------------------------- */
  const header = document.querySelector(".site-header");
  const onScroll = () => header && header.classList.toggle("is-scrolled", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Mobile navigation ---------------------------------------------------- */
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.getElementById("site-nav");
  const setMenu = (open) => {
    if (!toggle || !nav) return;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector(".menu-toggle__label").textContent = open ? "Close" : "Menu";
    nav.classList.toggle("is-open", open);
    document.body.style.overflow = open ? "hidden" : "";
  };
  toggle?.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle?.getAttribute("aria-expanded") === "true") { setMenu(false); toggle.focus(); }
  });
  nav?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  window.matchMedia("(min-width: 961px)").addEventListener("change", (e) => e.matches && setMenu(false));

  /* Hero entrance + scroll reveals -------------------------------------- */
  requestAnimationFrame(() => document.querySelector(".hero")?.classList.add("is-ready"));
  const reveals = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("is-visible"));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); io.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    reveals.forEach((el) => io.observe(el));
  }

  /* Message filters (Watch & listen) ------------------------------------ */
  const filterButtons = document.querySelectorAll("[data-filter]");
  const applyFilter = (value) => {
    const valid = [...filterButtons].some((b) => b.dataset.filter === value);
    if (!valid) value = "all";
    filterButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === value)));
    document.querySelectorAll("[data-category]").forEach((card) => {
      card.hidden = value !== "all" && !card.dataset.category.split(" ").includes(value);
    });
  };
  if (filterButtons.length) {
    filterButtons.forEach((b) => b.addEventListener("click", () => {
      applyFilter(b.dataset.filter);
      const url = new URL(location.href);
      b.dataset.filter === "all" ? url.searchParams.delete("filter") : url.searchParams.set("filter", b.dataset.filter);
      history.replaceState(null, "", url);
    }));
    applyFilter(new URLSearchParams(location.search).get("filter") || "all");
  }

  /* Video lightbox (YouTube, privacy-enhanced) --------------------------- */
  const dialog = document.getElementById("video-dialog");
  const frameWrap = dialog?.querySelector(".video-dialog__inner");
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-youtube]");
    if (!trigger || !dialog || typeof dialog.showModal !== "function") return;
    e.preventDefault();
    const id = trigger.dataset.youtube;
    const title = trigger.dataset.title || "Video";
    frameWrap.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
    iframe.title = title;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    frameWrap.appendChild(iframe);
    dialog.showModal();
  });
  const closeVideo = () => { dialog?.close(); };
  dialog?.querySelector(".video-dialog__close")?.addEventListener("click", closeVideo);
  dialog?.addEventListener("click", (e) => { if (e.target === dialog) closeVideo(); });
  dialog?.addEventListener("close", () => { if (frameWrap) frameWrap.innerHTML = ""; });

  /* Forms — Netlify Forms when hosted on Netlify; honest fallback elsewhere */
  const encode = (form) => new URLSearchParams(new FormData(form)).toString();
  document.querySelectorAll("form[data-netlify]").forEach((form) => {
    const status = form.querySelector(".form-status");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const button = form.querySelector('[type="submit"]');
      const label = button?.innerHTML;
      if (button) { button.disabled = true; button.textContent = "Sending…"; }
      try {
        const res = await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: encode(form) });
        if (!res.ok) throw new Error(res.status);
        form.reset();
        if (status) status.textContent = form.dataset.success || "Thank you — your message has been received.";
      } catch {
        if (status) status.textContent = "This preview can't send messages yet. Please reach Pastor Bola's team through Instagram @bollarinwa for now.";
      } finally {
        if (button) { button.disabled = false; button.innerHTML = label; }
      }
    });
  });

  /* Copy-to-clipboard (press kit bios) ---------------------------------- */
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = document.getElementById(btn.dataset.copy);
      if (!target) return;
      const original = btn.textContent;
      try {
        await navigator.clipboard.writeText(target.innerText.trim());
        btn.textContent = "Copied";
      } catch {
        const range = document.createRange(); range.selectNodeContents(target);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
        btn.textContent = "Selected — press Ctrl/Cmd + C";
      }
      setTimeout(() => (btn.textContent = original), 2400);
    });
  });
})();
