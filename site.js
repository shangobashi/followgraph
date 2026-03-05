const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.addEventListener("DOMContentLoaded", () => {
  initPointerGlow();
  initConstellation();
  initAnimations();
  initInstallModal();
});

function initPointerGlow() {
  const root = document.documentElement;

  document.addEventListener("pointermove", (event) => {
    root.style.setProperty("--pointer-x", `${event.clientX}px`);
    root.style.setProperty("--pointer-y", `${event.clientY}px`);
  });
}

function initAnimations() {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;

  if (!gsap || prefersReducedMotion) {
    return;
  }

  if (ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  const intro = gsap.timeline({
    defaults: { ease: "power3.out" }
  });

  intro
    .from(".topbar", { y: -24, autoAlpha: 0, duration: 0.8 })
    .from(".eyebrow", { y: 22, autoAlpha: 0, duration: 0.6 }, "-=0.45")
    .from(
      ".title-line > span",
      {
        yPercent: 120,
        skewY: 5,
        duration: 1.08,
        stagger: 0.12,
        ease: "power4.out"
      },
      "-=0.2"
    )
    .from(".lede", { y: 28, autoAlpha: 0, duration: 0.8 }, "-=0.58")
    .from(".actions > *", { y: 24, autoAlpha: 0, stagger: 0.12, duration: 0.65 }, "-=0.5")
    .from(".trust-row span", { y: 18, autoAlpha: 0, stagger: 0.08, duration: 0.5 }, "-=0.42")
    .from(".scan-surface", { y: 36, autoAlpha: 0, rotateX: 8, duration: 1 }, "-=0.82")
    .from(".float-note", { scale: 0.88, autoAlpha: 0, stagger: 0.1, duration: 0.6 }, "-=0.58");

  gsap.to(".ambient-a", {
    x: 48,
    y: -20,
    duration: 12,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut"
  });

  gsap.to(".ambient-b", {
    x: -34,
    y: 22,
    duration: 14,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut"
  });

  gsap.to(".ambient-c", {
    x: 12,
    y: -24,
    duration: 10,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut"
  });

  gsap.to(".hero-visual", {
    y: -10,
    duration: 5.6,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut"
  });

  gsap.to(".note-one", {
    y: -16,
    rotation: -4,
    duration: 3.6,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut"
  });

  gsap.to(".note-two", {
    y: 14,
    rotation: 3,
    duration: 4.2,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut"
  });

  gsap.to(".trust-row span", {
    x: 2.4,
    backgroundColor: "rgba(255, 255, 255, 0.062)",
    borderColor: "rgba(124, 242, 211, 0.22)",
    boxShadow: "0 8px 20px rgba(120, 166, 255, 0.06), inset 0 0 0 1px rgba(255, 255, 255, 0.03)",
    opacity: 1,
    duration: 2.8,
    stagger: {
      each: 0.12,
      from: "random",
      repeat: -1,
      yoyo: true
    },
    ease: "sine.inOut"
  });

  gsap.to(".scan-track span", {
    scaleX: 1.18,
    xPercent: 42,
    duration: 2.8,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
    transformOrigin: "left center"
  });

  gsap.to(".footer-rule-beam", {
    xPercent: 470,
    duration: 5.8,
    repeat: -1,
    ease: "none"
  });

  if (!ScrollTrigger) {
    return;
  }

  gsap.utils.toArray("[data-reveal]").forEach((element) => {
    gsap.from(element, {
      y: 42,
      autoAlpha: 0,
      duration: 0.88,
      ease: "power3.out",
      scrollTrigger: {
        trigger: element,
        start: "top 84%"
      }
    });
  });

  gsap.utils.toArray(".step").forEach((element, index) => {
    gsap.from(element, {
      y: 28,
      autoAlpha: 0,
      duration: 0.72,
      delay: index * 0.06,
      ease: "power3.out",
      scrollTrigger: {
        trigger: element,
        start: "top 86%"
      }
    });
  });
}

function initInstallModal() {
  const modalShell = document.getElementById("installModal");
  if (!(modalShell instanceof HTMLDivElement)) {
    return;
  }

  const dialog = modalShell.querySelector(".install-modal");
  const openers = Array.from(document.querySelectorAll("[data-open-install]"));
  const closers = Array.from(modalShell.querySelectorAll("[data-close-install]"));
  const gsap = window.gsap;

  let active = false;

  function openModal() {
    if (active) {
      return;
    }

    active = true;
    modalShell.hidden = false;
    modalShell.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    if (gsap && dialog && !prefersReducedMotion) {
      gsap.fromTo(
        modalShell,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.24, ease: "power2.out" }
      );

      gsap.fromTo(
        dialog,
        { y: 28, autoAlpha: 0, scale: 0.985 },
        { y: 0, autoAlpha: 1, scale: 1, duration: 0.36, ease: "power3.out" }
      );
    }
  }

  function closeModal() {
    if (!active) {
      return;
    }

    active = false;

    const finish = () => {
      modalShell.hidden = true;
      modalShell.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
    };

    if (gsap && dialog && !prefersReducedMotion) {
      gsap.to(dialog, {
        y: 20,
        autoAlpha: 0,
        scale: 0.985,
        duration: 0.2,
        ease: "power2.in"
      });

      gsap.to(modalShell, {
        autoAlpha: 0,
        duration: 0.22,
        ease: "power2.in",
        onComplete: finish
      });

      return;
    }

    finish();
  }

  openers.forEach((button) => {
    button.addEventListener("click", openModal);
  });

  closers.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

function initConstellation() {
  const canvas = document.getElementById("constellation");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  if (prefersReducedMotion) {
    canvas.style.opacity = "0.35";
    return;
  }

  const pointer = {
    x: window.innerWidth * 0.7,
    y: window.innerHeight * 0.22
  };

  let width = 0;
  let height = 0;
  let points = [];

  function makePoint() {
    const velocity = 0.14 + Math.random() * 0.2;
    const angle = Math.random() * Math.PI * 2;

    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      radius: 1.3 + Math.random() * 2.1
    };
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const count = Math.max(28, Math.min(54, Math.floor(width / 28)));
    points = Array.from({ length: count }, makePoint);
  }

  function draw() {
    context.clearRect(0, 0, width, height);

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];

      const dx = pointer.x - point.x;
      const dy = pointer.y - point.y;
      const distanceToPointer = Math.hypot(dx, dy) || 1;
      const attraction = distanceToPointer < 180 ? 0.0008 : 0;

      point.vx += dx * attraction;
      point.vy += dy * attraction;
      point.vx *= 0.992;
      point.vy *= 0.992;
      point.x += point.vx;
      point.y += point.vy;

      if (point.x < -40) point.x = width + 40;
      if (point.x > width + 40) point.x = -40;
      if (point.y < -40) point.y = height + 40;
      if (point.y > height + 40) point.y = -40;

      for (let j = i + 1; j < points.length; j += 1) {
        const other = points[j];
        const lx = other.x - point.x;
        const ly = other.y - point.y;
        const distance = Math.hypot(lx, ly);

        if (distance > 150) {
          continue;
        }

        context.strokeStyle = `rgba(124, 242, 211, ${0.12 - distance / 1800})`;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(other.x, other.y);
        context.stroke();
      }

      context.fillStyle = "rgba(238, 246, 255, 0.78)";
      context.beginPath();
      context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
      context.fill();
    }

    window.requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);

  document.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });

  resize();
  draw();
}



