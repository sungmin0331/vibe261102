(() => {
  const root = document.documentElement;

  // ---------- 테마 토글 ----------
  const themeToggle = document.querySelector(".theme-toggle");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  const currentTheme = () => root.dataset.theme || (systemDark.matches ? "dark" : "light");

  const updateThemeLabel = () => {
    const next = currentTheme() === "dark" ? "라이트" : "다크";
    themeToggle.setAttribute("aria-label", `${next} 모드로 전환`);
  };

  themeToggle.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
    updateThemeLabel();
  });
  systemDark.addEventListener("change", updateThemeLabel);
  updateThemeLabel();

  // ---------- 모바일 메뉴 ----------
  const navToggle = document.querySelector(".nav-toggle");
  const navMenu = document.getElementById("nav-menu");

  const setMenu = (open) => {
    navMenu.classList.toggle("open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
  };

  navToggle.addEventListener("click", () => setMenu(!navMenu.classList.contains("open")));
  navMenu.addEventListener("click", (e) => {
    if (e.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && navMenu.classList.contains("open")) {
      setMenu(false);
      navToggle.focus();
    }
  });

  // ---------- 현재 섹션 하이라이트 ----------
  const navLinks = [...navMenu.querySelectorAll("a")];
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const setActive = (id) => {
    navLinks.forEach((link) => {
      const active = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  sections.forEach((section) => observer.observe(section));

  // ---------- 이메일 복사 ----------
  const copyButton = document.querySelector(".copy-email");
  const feedback = document.querySelector(".copy-feedback");
  let feedbackTimer;

  const showFeedback = (message) => {
    feedback.textContent = message;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => (feedback.textContent = ""), 2500);
  };

  copyButton.addEventListener("click", async () => {
    const email = copyButton.dataset.email;
    try {
      await navigator.clipboard.writeText(email);
      showFeedback("이메일 주소를 복사했어요.");
    } catch (e) {
      showFeedback(`복사하지 못했어요. 직접 복사해 주세요: ${email}`);
    }
  });
})();
