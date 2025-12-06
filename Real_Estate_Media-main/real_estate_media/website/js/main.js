// Reveal sections on scroll
(function () {
  const revealables = document.querySelectorAll("[data-reveal]");

  function onScroll() {
    const triggerBottom = window.innerHeight * 0.85;

    revealables.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < triggerBottom) {
        el.classList.add("is-visible");
      }
    });
  }

  window.addEventListener("scroll", onScroll);
  window.addEventListener("load", onScroll);
})();

// Mobile nav toggle
(function () {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");

  if (!toggle || !links) return;

  toggle.addEventListener("click", () => {
    links.classList.toggle("open");
  });

  links.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => {
      links.classList.remove("open");
    });
  });
})();

// Back to top button
(function () {
  const btn = document.getElementById("to-top");
  if (!btn) return;

  function onScroll() {
    if (window.scrollY > 400) {
      btn.classList.add("visible");
    } else {
      btn.classList.remove("visible");
    }
  }

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", onScroll);
  window.addEventListener("load", onScroll);
})();

// "Add to inquiry" pseudo-cart for services
(function () {
  const buttons = document.querySelectorAll(".service-add");
  const summaryEl = document.getElementById("service-summary");
  const details = document.getElementById("details");

  if (!buttons.length || !summaryEl) return;

  const selections = [];

  function renderSummary() {
    if (!selections.length) {
      summaryEl.textContent =
        "No services selected yet. Click “Add to inquiry” on any package to build your ideal shoot.";
      return;
    }

    const text = selections
      .map((s, idx) => `${idx + 1}. ${s.name} (${s.price})`)
      .join("   ");

    summaryEl.textContent = text;

    // Prepend into details if not already there
    if (details) {
      const marker = "Selected services:";
      if (!details.value.includes(marker)) {
        details.value = `${marker} ${text}\n\n${details.value}`;
      } else {
        const parts = details.value.split(marker);
        const rest = parts[1] ? parts[1].split("\n").slice(1).join("\n") : "";
        details.value = `${marker} ${text}\n${rest}`;
      }
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.serviceName;
      const price = btn.dataset.servicePrice;

      selections.push({ name, price });
      renderSummary();
      btn.textContent = "Added ✓";
      setTimeout(() => {
        btn.textContent = "Add to inquiry";
      }, 1200);
    });
  });
})();

// Fake contact form "submission" (for demo)
(function () {
  const form = document.getElementById("contact-form");
  const status = document.getElementById("contact-status");

  if (!form || !status) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("name")?.value.trim() || "there";

    status.textContent = `Thanks, ${name}. On a live site, this would send your request (and chosen services) directly into our booking system.`;
  });
})();
