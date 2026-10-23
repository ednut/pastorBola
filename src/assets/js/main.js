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

  /* Forms: sent to /api/forms (see lib/forms.js) ------------------------ */
  let navigating = false;
  const leaving = () => navigating;
  document.querySelectorAll("form[data-form]").forEach((form) => {
    const status = form.querySelector(".form-status");
    const say = (message, isError = false) => {
      if (!status) return;
      status.textContent = message;
      status.setAttribute("role", isError ? "alert" : "status");
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const button = form.querySelector('[type="submit"]');
      const label = button?.innerHTML;
      if (button) { button.disabled = true; button.textContent = "Sending…"; }
      say("");
      try {
        const res = await fetch(form.getAttribute("action") || "/api/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok && data.checkout_url) {
          say("Taking you to the secure payment page…");
          navigating = true;
          window.location.href = data.checkout_url;
          return;
        } else if (res.ok && data.ok) {
          form.reset();
          say(form.dataset.success || "Thank you — your message has been received.");
        } else if (res.status === 422 && data.fields) {
          say(Object.values(data.fields)[0], true);
        } else if (res.status === 502 && data.error === "checkout_failed") {
          say("We couldn't start the payment in that currency. Please choose another currency and try again.", true);
        } else if (res.status === 503) {
          say("This form isn't switched on yet. Please reach Pastor Bola's team through Instagram @bollarinwa for now.", true);
        } else if (res.status === 429) {
          say("Too many attempts. Please wait a few minutes and try again.", true);
        } else {
          say("Sorry, something went wrong. Please try again in a moment.", true);
        }
      } catch {
        say("Sorry, we couldn't send that. Please check your connection and try again.", true);
      } finally {
        if (button && !leaving()) { button.disabled = false; button.innerHTML = label; }
      }
    });
  });

  /* E-book checkout: pick a sensible currency from the visitor's time zone (they can change it) */
  document.querySelectorAll("[data-currency] select").forEach((select) => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    let pick = "USD";
    if (zone === "Africa/Lagos") pick = "NGN";
    else if (/^Europe\/(London|Belfast|Jersey|Guernsey|Isle_of_Man)$/.test(zone)) pick = "GBP";
    else if (zone.startsWith("Europe/")) pick = "EUR";
    else if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal|Moncton|Glace_Bay|Iqaluit|Whitehorse|Yellowknife)$/.test(zone)) pick = "CAD";
    if ([...select.options].some((o) => o.value === pick)) select.value = pick;
  });

  /* E-book thank-you page: confirm the payment, then show the download ---- */
  const box = document.getElementById("ebook-status");
  if (box) {
    const title = document.getElementById("ebook-status-title");
    const text = document.getElementById("ebook-status-text");
    const actions = document.getElementById("ebook-status-actions");
    const reference = new URLSearchParams(location.search).get("reference");
    const show = (heading, message, buttons = []) => {
      title.textContent = heading;
      text.textContent = message;
      actions.replaceChildren();
      actions.hidden = !buttons.length;
      buttons.forEach((b) => {
        const el = document.createElement(b.onClick ? "button" : "a");
        el.className = "btn" + (b.ghost ? " btn--ghost" : "");
        if (b.onClick) { el.type = "button"; el.addEventListener("click", b.onClick); }
        else { el.href = b.href; if (b.download) el.setAttribute("download", ""); }
        el.textContent = b.label;
        actions.append(el);
      });
    };
    const again = { label: "Try again", href: "/books/#order", ghost: true };
    const contact = { label: "Contact the team", href: "/contact/", ghost: true };
    const notYet = () => show(
      "We haven't received your payment yet",
      "If you have just paid, it can take a minute, so please check again. If you did not complete the payment, nothing has been charged and you can try again.",
      [{ label: "Check again", onClick: () => { show("Confirming your payment…", "This usually takes a few seconds.", []); check(0); } }, again, contact]
    );
    const check = async (attempt) => {
      if (!reference) { show("We could not find your payment", "This page needs the link Korapay sends you after paying.", [{ label: "Back to the book", href: "/books/" }]); return; }
      const later = () => (attempt < 4 ? setTimeout(() => check(attempt + 1), 2000 + attempt * 1500) : notYet());
      try {
        const res = await fetch(`/api/payment-status?reference=${encodeURIComponent(reference)}`, { headers: { Accept: "application/json" } });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.state === "paid") {
          show("Payment received", "Thank you. Your e-book is ready. Please save the file to your device once it has downloaded. If an email with the link also arrives, you can use either.", [{ label: "Download the e-book", href: data.download_url, download: true }]);
        } else if (res.ok && data.state === "failed") {
          show("Your payment was not completed", "Nothing has been charged. You can try again whenever you are ready.", [{ label: "Try again", href: "/books/#order" }]);
        } else if (res.ok && data.state === "wrong_amount") {
          show("We could not confirm the full amount", "Please contact Pastor Bola's team so we can sort this out.", [{ label: "Contact the team", href: "/contact/" }]);
        } else if (res.status === 503) {
          show("This is not switched on yet", "Please contact Pastor Bola's team.", [{ label: "Contact the team", href: "/contact/" }]);
        } else if (res.status === 429) {
          show("Please wait a moment", "There have been a lot of checks from this device. Wait a minute, then check again.", [{ label: "Check again", onClick: () => check(0) }, contact]);
        } else {
          later();
        }
      } catch { later(); }
    };
    check(0);
  }

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

  /* Book: flip between front and back cover ------------------------------ */
  document.querySelectorAll(".book--flip").forEach((book) => {
    const btn = book.querySelector(".book__flip");
    const hint = book.querySelector(".book__hint");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const flipped = book.classList.toggle("is-flipped");
      btn.setAttribute("aria-pressed", String(flipped));
      btn.setAttribute("aria-label", flipped ? "Turn the book over to see the front cover" : "Turn the book over to see the back cover");
      if (hint) hint.textContent = flipped ? "Tap to see the front cover" : "Tap to see the back cover";
    });
  });
})();
