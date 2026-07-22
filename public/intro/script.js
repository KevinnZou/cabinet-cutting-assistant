const header = document.querySelector(".site-header");
const menuButton = document.querySelector(".menu-button");
const navLinks = document.querySelector(".nav-links");
const calculateButton = document.querySelector(".calculate-button");
const placeholder = document.querySelector(".result-placeholder");
const resultContent = document.querySelector(".result-content");

const rules = {
  board: {
    title: "标准板规格",
    description: "默认按 1220 × 2440 mm 计算。每张板会扣除实际锯缝，并按板件尺寸与方向寻找更优组合。",
  },
  grain: {
    title: "木纹方向约束",
    description: "木纹默认沿板材 2440 mm 方向。排版时保持纹理方向一致，避免板件旋转后出现纹路错向。",
  },
  kerf: {
    title: "3 mm 切割锯缝",
    description: "相邻板件之间默认预留 3 mm 锯缝。锯缝会计入排版宽度，避免理论上能排、实际下不了刀。",
  },
  edge: {
    title: "封边损耗与取整",
    description: "先按封边边数累计实际长度，再增加 3% 损耗；最终结果以米为单位向上取整，便于领料。",
  },
  strip: {
    title: "条子料默认长度",
    description: "连续条子料默认按 2440 mm 整条计算。开单员可按设备、余料与实际加工习惯修改默认长度。",
  },
};

function updateHeader() {
  header?.classList.toggle("scrolled", window.scrollY > 18);
}

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

menuButton?.addEventListener("click", () => {
  const open = menuButton.classList.toggle("open");
  navLinks?.classList.toggle("open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
});

navLinks?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuButton?.classList.remove("open");
    navLinks.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

document.querySelectorAll(".rule-item").forEach((item) => {
  item.addEventListener("click", () => {
    const key = item.getAttribute("data-rule");
    if (!key || !rules[key]) return;

    document.querySelectorAll(".rule-item").forEach((rule) => rule.classList.remove("active"));
    item.classList.add("active");
    document.getElementById("rule-title").textContent = rules[key].title;
    document.getElementById("rule-description").textContent = rules[key].description;
  });
});

calculateButton?.addEventListener("click", () => {
  if (calculateButton.classList.contains("loading")) return;

  calculateButton.classList.add("loading");
  calculateButton.querySelector(".button-label").textContent = "正在计算";

  window.setTimeout(() => {
    calculateButton.classList.remove("loading");
    calculateButton.querySelector(".button-label").textContent = "重新计算";
    placeholder.hidden = true;
    resultContent.hidden = false;
    resultContent.classList.remove("visible");
    void resultContent.offsetWidth;
    resultContent.classList.add("visible");
  }, 720);
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    });
  },
  { threshold: 0.12 }
);

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
document.getElementById("year").textContent = new Date().getFullYear();
