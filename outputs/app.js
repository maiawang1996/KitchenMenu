const TAB_META = {
  today: { label: "今天", icon: "sun" },
  recipes: { label: "菜谱", icon: "book" },
  plan: { label: "菜单", icon: "calendar" },
  journal: { label: "札记", icon: "note" },
  stock: { label: "库存", icon: "pantry" },
};

const recipes = [
  {
    id: "tomato-egg",
    name: "番茄炒蛋",
    tag: "快菜",
    minutes: 12,
    favorite: true,
    image: "./assets/tomato-egg-jelly.png",
    ingredients: ["番茄", "鸡蛋", "葱"],
    steps: ["番茄切块，鸡蛋打散。", "热锅炒蛋至凝固后盛出。", "番茄炒出汁，倒回鸡蛋，加盐和葱花。"],
  },
  {
    id: "beef-potato",
    name: "土豆牛肉",
    tag: "慢菜",
    minutes: 45,
    favorite: false,
    image: "./assets/beef-potato-jelly.png",
    ingredients: ["牛肉", "土豆", "胡萝卜", "洋葱"],
    steps: ["牛肉焯水，土豆和胡萝卜切块。", "洋葱炒香后加入牛肉和调味料。", "加水炖 35 分钟，放入土豆收汁。"],
  },
];

const state = {
  tab: "today",
  detailId: null,
  editingRecipeId: null,
  editingStockId: null,
  search: "",
  recommendationIndex: 0,
  selectedIngredient: null,
  stock: [
    { id: "s1", name: "牛肉", qty: "300g", purchasedAt: "2026-07-12" },
    { id: "s2", name: "鸡蛋", qty: "6 个", purchasedAt: "2026-07-10" },
    { id: "s3", name: "番茄", qty: "3 个", purchasedAt: "2026-07-11" },
    { id: "s4", name: "洋葱", qty: "1 个", purchasedAt: "2026-07-13" },
  ],
  cooked: [
    { recipeId: "tomato-egg", date: "2026-07-12" },
    { recipeId: "beef-potato", date: "2026-07-11" },
    { recipeId: "tomato-egg", date: "2026-07-09" },
    { recipeId: "beef-potato", date: "2026-07-06" },
  ],
  weekPlan: [
    { date: "周一", lunch: "tomato-egg", dinner: "beef-potato" },
    { date: "周二", lunch: "", dinner: "tomato-egg" },
    { date: "周三", lunch: "beef-potato", dinner: "" },
    { date: "周四", lunch: "", dinner: "tomato-egg" },
    { date: "周五", lunch: "beef-potato", dinner: "" },
    { date: "周六", lunch: "", dinner: "" },
    { date: "周日", lunch: "", dinner: "" },
  ],
  purchased: new Set(["米饭"]),
};

const view = document.querySelector("#view");
const pageTitle = document.querySelector("#pageTitle");
const todayText = document.querySelector("#todayText");
const sheet = document.querySelector("#sheet");
const sheetContent = document.querySelector("#sheetContent");

todayText.textContent = currentDateLabel();

function iconSvg(name) {
  const icons = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h.01M12 12h.01M18 12h.01" /></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M4.5 12H2M22 12h-2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8" /></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h10a2.5 2.5 0 0 1 2.5 2.5v12.5A1.5 1.5 0 0 0 18 18H7a3 3 0 0 0-3 3V7a2.5 2.5 0 0 1 3-2.5Z" /><path d="M7.5 7h8" /></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><path d="M7 3.5v4M17 3.5v4M3.5 10.5h17" /></svg>',
    pantry: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h10l1.2 3v11a1.5 1.5 0 0 1-1.5 1.5H7.3A1.8 1.8 0 0 1 5.5 18.2V7.5l1.5-3Z" /><path d="M9 9.5h6" /></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10A2.5 2.5 0 0 1 17 19.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Z" /><path d="M8.5 9h7M8.5 12h7M8.5 15h4" /></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="M4.8 17l4.2-4.2a1.5 1.5 0 0 1 2.1 0L14 15l2.2-2.2a1.5 1.5 0 0 1 2.1 0l1.2 1.2" /></svg>',
  };
  return icons[name] || icons.note;
}

function doodleSvg(name) {
  const doodles = {
    meal: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M28 74c3-21 15-33 32-33s29 11 32 33" />
        <path d="M23 74h74" />
        <path d="M38 74c0 10 9 18 22 18s22-8 22-18" />
        <path d="M44 46c1 4 3 7 6 10" />
        <path d="M56 42c1 5 1 8 0 12" />
        <path d="M68 46c2 4 4 7 7 10" />
        <circle cx="92" cy="35" r="10" />
        <path d="M92 18v5M92 47v5M75 35h5M104 35h5M81 24l3 3M100 24l-3 3M81 46l3-3M100 46l-3-3" />
      </svg>
    `,
    tea: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M39 50h35c5 0 9 4 9 9v9c0 10-8 18-18 18H51c-10 0-18-8-18-18v-9c0-5 4-9 6-9Z" />
        <path d="M83 59h6c5 0 9 4 9 9s-4 9-9 9h-3" />
        <path d="M38 87h42" />
        <path d="M50 34c0 6-4 8-4 12" />
        <path d="M62 30c0 6-4 8-4 12" />
        <path d="M75 34c0 6-4 8-4 12" />
      </svg>
    `,
    notebook: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M32 28h44c6 0 11 5 11 11v42c0 6-5 11-11 11H32c-6 0-11-5-11-11V39c0-6 5-11 11-11Z" />
        <path d="M40 28v64" />
        <path d="M49 40h24M49 51h24M49 62h18" />
        <path d="M74 18v20M82 18v20" />
        <path d="M71 18h14" />
        <path d="M89 73l8-8 5 5-8 8" />
      </svg>
    `,
    checklist: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M35 26h42c6 0 11 5 11 11v46c0 6-5 11-11 11H35c-6 0-11-5-11-11V37c0-6 5-11 11-11Z" />
        <path d="M47 37h19" />
        <path d="M41 53h4" />
        <path d="M49 52l4 4 8-9" />
        <path d="M41 66h4" />
        <path d="M49 65l4 4 8-9" />
        <path d="M41 79h4" />
        <path d="M49 78l4 4 8-9" />
        <path d="M83 32l6 6" />
        <path d="M89 32l-6 6" />
      </svg>
    `,
    sprout: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M58 82V58" />
        <path d="M58 60c-10 0-18-7-20-18 10 1 19 4 25 11" />
        <path d="M58 60c10 0 18-7 20-18-10 1-19 4-25 11" />
        <path d="M44 83h28" />
        <path d="M40 83c4 10 13 17 20 17s16-7 20-17" />
      </svg>
    `,
  };
  return doodles[name] || doodles.notebook;
}

function doodlePanel(name, label = "") {
  return `
    <div class="doodle-panel doodle-${name}" aria-hidden="true">
      ${doodleSvg(name)}
      ${label ? `<span>${label}</span>` : ""}
    </div>
  `;
}

function emptyIllustration(title, text, doodle = "notebook") {
  return `
    <div class="card empty empty-illustrated">
      ${doodlePanel(doodle)}
      <div class="empty-copy">
        <strong>${title}</strong>
        <span>${text}</span>
      </div>
    </div>
  `;
}

function initChrome() {
  const addButton = document.querySelector("#addRecipeTop");
  if (addButton) addButton.innerHTML = iconSvg("plus");
  document.querySelectorAll(".tab").forEach((button) => {
    const meta = TAB_META[button.dataset.tab];
    if (!meta) return;
    button.innerHTML = `${iconSvg(meta.icon)}<small>${meta.label}</small>`;
  });
}

function currentDateLabel() {
  const date = new Date();
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdayLabel(date)}`;
}

function weekdayLabel(date = new Date()) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
}

function todayPlan() {
  return state.weekPlan.find((item) => item.date === weekdayLabel()) || state.weekPlan[0];
}

function recipeById(id) {
  return recipes.find((recipe) => recipe.id === id);
}

function recipeImageSrc(recipe) {
  return recipe?.image || "";
}

function recipeMedia(recipe, variant = "recipe", alt = "", extraAttrs = "") {
  const src = recipeImageSrc(recipe);
  const imageClass = variant === "plan-card" ? "plan-card-media" : `${variant}-image`;
  if (src) {
    return `<img class="${imageClass}" ${extraAttrs} src="${escapeHtml(src)}" alt="${escapeHtml(alt || recipe?.name || "")}" />`;
  }
  return `
    <div class="${imageClass} media-placeholder" ${extraAttrs} aria-hidden="true">
      <span>${iconSvg("image")}</span>
      <strong>未放入图片</strong>
      <small>可从手机相册更新</small>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function daysSince(dateString) {
  const start = new Date(dateString);
  const diff = new Date(todayKey()) - start;
  return Math.max(0, Math.round(diff / 86400000));
}

function recentRecipeIds() {
  return state.cooked.slice(0, 4).map((item) => item.recipeId);
}

function stockNames() {
  return state.stock.map((item) => item.name);
}

function recommendationPool() {
  const recent = recentRecipeIds();
  const stock = stockNames();
  return recipes
    .map((recipe) => {
      const stocked = recipe.ingredients.filter((item) => stock.includes(item)).length;
      const recentPenalty = recent.includes(recipe.id) ? -24 : 18;
      const quickBonus = recipe.tag === "快菜" ? 10 : 2;
      const random = recipe.name.charCodeAt(0) % 9;
      return { recipe, score: stocked * 18 + recentPenalty + quickBonus + random };
    })
    .sort((a, b) => b.score - a.score);
}

function currentRecommendation() {
  const pool = recommendationPool();
  return pool[state.recommendationIndex % pool.length];
}

function reasonsFor(recipe) {
  const stock = stockNames();
  const matched = recipe.ingredients.filter((item) => stock.includes(item));
  const recent = recentRecipeIds().includes(recipe.id);
  return [
    recent ? "最近吃过，但库存匹配度高" : "最近没有吃过，适合换换口味",
    matched.length ? `家里已有：${matched.join("、")}` : "缺的食材少，适合加入购物清单",
    `${recipe.minutes} 分钟左右完成，属于${recipe.tag}`,
  ];
}

function stockAgeText(item) {
  return daysSince(item.purchasedAt) === 0 ? "今天买入" : `买了 ${daysSince(item.purchasedAt)} 天`;
}

function setTab(tab) {
  state.tab = tab;
  state.detailId = null;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  render();
}

function openDetail(id) {
  state.detailId = id;
  render();
}

function markCooked(id) {
  state.cooked.unshift({ recipeId: id, date: todayKey() });
  showToast(`已记录：${recipeById(id).name}`);
  setTab("today");
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText =
    "position:fixed;left:50%;bottom:92px;z-index:60;transform:translateX(-50%);max-width:88%;padding:11px 14px;border-radius:999px;background:#f1eadf;color:#3c3528;font-weight:700;box-shadow:0 8px 18px rgba(86,68,46,.08);border:1px solid rgba(185,165,135,.25)";
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 1700);
}

function openSheet(html) {
  sheetContent.innerHTML = html;
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
}

function closeSheet() {
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
  state.editingRecipeId = null;
  state.editingStockId = null;
}

function recipeCard(recipe, { compact = false } = {}) {
  return `
    <article class="card recipe-card ${compact ? "recipe-card-compact" : ""}" data-recipe="${recipe.id}">
      <div class="recipe-thumb" aria-hidden="true">
        ${recipeMedia(recipe, "recipe-thumb", recipe.name)}
      </div>
      <div class="recipe-body">
        <h3>${recipe.name}</h3>
        ${compact ? "" : `<div class="tag-row"><span class="tag ${recipe.tag === "慢菜" ? "slow" : ""}">${recipe.tag}</span>${recipe.favorite ? '<span class="tag blue">收藏</span>' : ""}</div><p class="recipe-meta">${recipe.ingredients.join("、")} · ${recipe.minutes} 分钟</p>`}
      </div>
    </article>
  `;
}

function renderToday() {
  pageTitle.textContent = "今天吃什么";
  const plan = todayPlan();
  const planEntries = [
    { label: "午餐", id: plan.lunch },
    { label: "晚餐", id: plan.dinner },
  ]
    .map((entry) => ({ ...entry, recipe: entry.id ? recipeById(entry.id) : null }))
    .filter((entry) => entry.recipe);

  const stocks = state.stock.slice(0, 4);
  const favorites = recipes.filter((recipe) => recipe.favorite);

  view.innerHTML = `
    <div class="today-page">
    <section class="section">
      <article class="card journal-hero">
        <div class="journal-hero-copy">
          <p class="journal-date">${currentDateLabel()}</p>
          <h2 class="journal-title">今天吃什么</h2>
          <p class="journal-lead">温柔地做一顿饭，把厨房留下一点生活的痕迹。</p>
        </div>
        ${doodlePanel("meal")}
      </article>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>今日计划</h2>
        <span class="muted">${plan.date}</span>
      </div>
      <div class="journal-stack">
        ${planEntries
          .map(
            (entry) => `
              <article class="card plan-card" data-action="detail" data-id="${entry.recipe.id}">
                <div class="plan-card-image">
                  ${recipeMedia(entry.recipe, "plan-card", entry.recipe.name)}
                </div>
                <div class="plan-card-body">
                  <p class="plan-label">${entry.label}</p>
                  <h3>${entry.recipe.name}</h3>
                  <p class="muted">${entry.recipe.tag} · ${entry.recipe.minutes} 分钟</p>
                </div>
              </article>
              `,
          )
          .join("") || emptyIllustration("今天还没有安排菜谱", "把一道想做的菜先放进来。")}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>库存提醒</h2>
        <span class="muted">买了几天</span>
      </div>
      <div class="paper-list">
        ${stocks
          .map(
            (item) => `
              <article class="card journal-row" data-stock-id="${item.id}">
                <div class="journal-row-icon">${iconSvg("pantry")}</div>
                <div class="journal-row-main">
                  <strong>${item.name}</strong>
                  <span>${item.qty || "未填数量"}</span>
                </div>
                <div class="journal-row-meta">${stockAgeText(item)}</div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>收藏</h2>
        <span class="muted">${favorites.length} 道</span>
      </div>
      <div class="recipe-grid recipe-grid-home">
        ${favorites.map((recipe) => recipeCard(recipe, { compact: true })).join("") || emptyIllustration("还没有收藏菜谱", "看到喜欢的菜就先存起来。", "tea")}
      </div>
    </section>

    <section class="section">
      <button class="primary-btn" style="width:100%" data-action="addRecipe">新增菜谱</button>
    </section>
    </div>
  `;
}

function renderRecipes() {
  pageTitle.textContent = "菜谱札记";
  if (state.detailId) {
    renderRecipeDetail(state.detailId);
    return;
  }
  const filtered = recipes.filter((recipe) => {
    const text = `${recipe.name}${recipe.ingredients.join("")}${recipe.tag}`;
    return text.includes(state.search.trim());
  });
  view.innerHTML = `
    <section class="section">
      <input class="search" id="searchRecipe" value="${escapeHtml(state.search)}" placeholder="搜索菜名、食材或标签" />
    </section>
    <div class="recipe-grid recipe-grid-list">
      ${
        filtered
          .map(
            (recipe) => `
              <article class="card recipe-card recipe-card-list" data-recipe="${recipe.id}">
                <div class="recipe-thumb" aria-hidden="true">
                  ${recipeMedia(recipe, "recipe-thumb", recipe.name)}
                </div>
                <div class="recipe-body">
                  <h3>${recipe.name}</h3>
                  <p class="recipe-meta">${recipe.tag} · ${recipe.minutes} 分钟</p>
                </div>
              </article>
            `,
          )
          .join("") || emptyIllustration("没有找到相关菜谱", "换个关键词再看看。")
      }
    </div>
  `;
}

function renderRecipeDetail(id) {
  const recipe = recipeById(id);
  pageTitle.textContent = recipe.name;
  view.innerHTML = `
    <section class="section detail-top">
      <div class="detail-head">
        <button class="icon-ghost-btn" data-action="backRecipes" aria-label="返回">${iconSvg("back")}</button>
        <button class="icon-ghost-btn" data-action="editRecipe" data-recipe-id="${recipe.id}" aria-label="编辑菜谱">${iconSvg("more")}</button>
      </div>
      <div class="detail-cover">${recipeMedia(recipe, "detail-cover", recipe.name)}</div>
      <div class="detail-title">
        <h2>${recipe.name}</h2>
        <div class="tag-row">
          <span class="tag ${recipe.tag === "慢菜" ? "slow" : ""}">${recipe.tag}</span>
          <span class="tag blue">${recipe.minutes} 分钟</span>
        </div>
      </div>
    </section>

    <section class="section paper-card">
      <h2>原材料</h2>
      <ul class="plain-list">${recipe.ingredients.map((item) => `<li>${item}</li>`).join("")}</ul>
    </section>

    <section class="section paper-card">
      <h2>做法</h2>
      <ol class="step-list">${recipe.steps.map((step, index) => `<li><span>${index + 1}</span><p>${step}</p></li>`).join("")}</ol>
    </section>

    <div class="sticky-action">
      <button class="primary-btn" data-action="markCooked" data-id="${recipe.id}">今天做了</button>
    </div>
  `;
}

function renderPlan() {
  pageTitle.textContent = "一周菜单";
  view.innerHTML = `
    <section class="plan-list">
      ${state.weekPlan
        .map(
          (day, index) => `
            <article class="card plan-day paper-card">
              <h3>${day.date}</h3>
              ${mealSelect(index, "lunch", "午餐", day.lunch)}
              ${mealSelect(index, "dinner", "晚餐", day.dinner)}
            </article>
          `,
        )
        .join("")}
    </section>

    <section class="section">
      <div class="section-head">
        <h2>购物清单</h2>
        <span class="muted">自动合并重复食材</span>
      </div>
      <div class="shopping-list">${shoppingItems().length ? shoppingItems().map(shoppingRow).join("") : emptyIllustration("购物清单还是空的", "把一周菜单先排上，就会自动生成。")}</div>
    </section>
  `;
}

function mealSelect(index, key, label, selected) {
  return `
    <label class="meal-row">
      <span class="muted">${label}</span>
      <select data-plan-index="${index}" data-meal="${key}">
        <option value="">未安排</option>
        ${recipes.map((recipe) => `<option value="${recipe.id}" ${selected === recipe.id ? "selected" : ""}>${recipe.name}</option>`).join("")}
      </select>
    </label>
  `;
}

function shoppingItems() {
  const plannedIds = state.weekPlan.flatMap((day) => [day.lunch, day.dinner]).filter(Boolean);
  const counts = new Map();
  plannedIds.forEach((id) => {
    const recipe = recipeById(id);
    if (!recipe) return;
    recipe.ingredients.forEach((ingredient) => counts.set(ingredient, (counts.get(ingredient) || 0) + 1));
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function shoppingRow([name, count]) {
  const done = state.purchased.has(name);
  return `
    <label class="card list-item paper-card checkbox-row ${done ? "done" : ""}">
      <input type="checkbox" data-shopping="${name}" ${done ? "checked" : ""} />
      <div class="list-main"><strong>${name}</strong><span>出现在 ${count} 道计划菜里</span></div>
    </label>
  `;
}

function renderStock() {
  pageTitle.textContent = "库存";
  const ingredients = Array.from(new Set(recipes.flatMap((recipe) => recipe.ingredients))).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const selected = state.selectedIngredient;
  view.innerHTML = `
    <section class="section">
      <div class="section-head">
        <h2>家里现有</h2>
        <button class="pill-btn" data-action="addStock">添加</button>
      </div>
      <div class="stock-list">
        ${state.stock
          .map(
            (item) => `
              <article class="card list-item paper-card stock-row" data-stock-id="${item.id}">
                <div class="list-main">
                  <strong>${item.name}</strong>
                  <span>${item.qty || "未填数量"} · ${stockAgeText(item)}</span>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>食材索引</h2>
        <span class="muted">${ingredients.length} 种</span>
      </div>
      <div class="tag-row">
        ${ingredients.map((name) => `<button class="chip tag ${selected === name ? "slow" : ""}" data-ingredient="${name}">${name}</button>`).join("")}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>${selected ? `${selected} 可以做` : "点一个食材看看"}</h2>
      </div>
      ${
        selected
          ? `<div class="recipe-grid">${recipes
              .filter((recipe) => recipe.ingredients.includes(selected))
              .map((recipe) => recipeCard(recipe))
              .join("") || emptyIllustration("暂时没有菜谱", "可以先新增一个同食材的菜。")}</div>`
          : emptyIllustration("还没有选食材", "点上面的食材名，看看能做什么。", "sprout")
      }
    </section>
  `;
}

function renderJournal() {
  pageTitle.textContent = "厨房札记";
  const ingredientUse = {};
  state.cooked.forEach((item) => {
    const recipe = recipeById(item.recipeId);
    if (!recipe) return;
    recipe.ingredients.forEach((ingredient) => {
      ingredientUse[ingredient] = (ingredientUse[ingredient] || 0) + 1;
    });
  });
  const topIngredient = Object.entries(ingredientUse).sort((a, b) => b[1] - a[1])[0] || ["暂无", 0];
  const cookedCounts = state.cooked.reduce((acc, item) => {
    acc[item.recipeId] = (acc[item.recipeId] || 0) + 1;
    return acc;
  }, {});
  const mostCookedId = Object.entries(cookedCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const { recipe } = currentRecommendation();

  view.innerHTML = `
    <section class="section">
      <article class="card journal-note">
        <div class="journal-note-copy">
          <p class="journal-date">${currentDateLabel()}</p>
          <h2>今日推荐</h2>
          <p class="journal-lead">${recipe.name} 比较适合今天。</p>
          <p class="muted">${reasonsFor(recipe).join("；")}。</p>
          <div class="meter"><span style="width:82%"></span></div>
          <div class="button-row" style="margin-top:14px">
            <button class="primary-btn" data-action="detail" data-id="${recipe.id}">查看菜谱</button>
            <button class="ghost-btn" data-action="nextRecommend">换一个</button>
          </div>
        </div>
        ${doodlePanel("tea")}
      </article>
    </section>

    <section class="section">
      <div class="section-head"><h2>本周观察</h2></div>
      <div class="stats-grid">
        <div class="card stat-card paper-card"><b>${state.cooked.length}</b><span class="muted">最近做饭次数</span></div>
        <div class="card stat-card paper-card"><b>${topIngredient[1]}</b><span class="muted">${topIngredient[0]} 使用次数</span></div>
      </div>
    </section>

    <section class="section paper-card">
      <h2>饮食建议</h2>
      <p class="muted">本周最常做：${mostCookedId ? recipeById(mostCookedId).name : "暂无"}。牛肉类菜品偏多，可以在周菜单里增加青菜、番茄或香菇类菜，平衡蔬菜摄入。</p>
    </section>
  `;
}

function openRecipeSheet(recipe = null) {
  state.editingRecipeId = recipe?.id ?? null;
  openSheet(`
    <h2>${recipe ? "编辑菜谱" : "新增菜谱"}</h2>
    <form class="form" id="recipeForm">
      <div class="field"><label>菜名</label><input name="name" required placeholder="例如：红烧牛肉" value="${escapeHtml(recipe?.name ?? "")}" /></div>
      <div class="field">
        <label>图片</label>
        <div class="image-preview">
          ${recipeMedia(recipe, "image-preview", "菜谱图片预览", 'data-image-preview')}
        </div>
        <input name="image" type="file" accept="image/*" capture="environment" data-image-input />
        <p class="muted">从手机相册或相机选择图片，留空则保留当前图片。</p>
      </div>
      <div class="field">
        <label>标签</label>
        <div class="segmented">
          <button type="button" class="${recipe?.tag === "快菜" || !recipe ? "active" : ""}" data-form-tag="快菜">快菜</button>
          <button type="button" class="${recipe?.tag === "慢菜" ? "active" : ""}" data-form-tag="慢菜">慢菜</button>
        </div>
      </div>
      <div class="field"><label>原材料</label><textarea name="ingredients" required placeholder="用顿号或换行分隔，例如：牛肉、土豆、洋葱">${escapeHtml(recipe?.ingredients.join("、") ?? "")}</textarea></div>
      <div class="field"><label>做法</label><textarea name="steps" required placeholder="每一步换一行">${escapeHtml(recipe?.steps.join("\n") ?? "")}</textarea></div>
      <button class="primary-btn" type="submit">保存菜谱</button>
    </form>
  `);
}

function openStockSheet(stock = null) {
  state.editingStockId = stock?.id ?? null;
  openSheet(`
    <h2>${stock ? "编辑库存" : "添加库存"}</h2>
    <form class="form" id="stockForm">
      <div class="field"><label>食材名称</label><input name="name" required placeholder="例如：番茄" value="${escapeHtml(stock?.name ?? "")}" /></div>
      <div class="field"><label>数量</label><input name="qty" placeholder="例如：3 个" value="${escapeHtml(stock?.qty ?? "")}" /></div>
      <button class="primary-btn" type="submit">保存库存</button>
      ${stock ? '<button class="ghost-btn" type="button" data-action="deleteStock">删除库存</button>' : ""}
    </form>
  `);
}

function render() {
  view.scrollTop = 0;
  if (state.detailId) {
    renderRecipeDetail(state.detailId);
    return;
  }
  if (state.tab === "today") renderToday();
  if (state.tab === "recipes") renderRecipes();
  if (state.tab === "plan") renderPlan();
  if (state.tab === "journal") renderJournal();
  if (state.tab === "stock") renderStock();
}

initChrome();

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});

document.querySelector("#addRecipeTop").addEventListener("click", () => openRecipeSheet());

view.addEventListener("click", (event) => {
  const recipeCardEl = event.target.closest("[data-recipe]");
  const actionEl = event.target.closest("[data-action]");
  const quickEl = event.target.closest("[data-go]");
  const ingredientEl = event.target.closest("[data-ingredient]");
  const stockRowEl = event.target.closest("[data-stock-id]");

  if (actionEl) {
    const { action, id, recipeId } = actionEl.dataset;
    if (action === "detail") {
      openDetail(id);
    }
    if (action === "nextRecommend") {
      state.recommendationIndex += 1;
      render();
    }
    if (action === "markCooked") markCooked(id);
    if (action === "backRecipes") {
      state.detailId = null;
      render();
    }
    if (action === "addRecipe") openRecipeSheet();
    if (action === "editRecipe") {
      const recipe = recipeById(recipeId || id);
      if (recipe) openRecipeSheet(recipe);
    }
    if (action === "addStock") openStockSheet();
    if (action === "editStock") {
      const stock = state.stock.find((item) => item.id === id || item.id === actionEl.dataset.stockId);
      if (stock) openStockSheet(stock);
    }
    if (action === "deleteStock" && state.editingStockId) {
      state.stock = state.stock.filter((item) => item.id !== state.editingStockId);
      closeSheet();
      render();
    }
    return;
  }

  if (recipeCardEl) openDetail(recipeCardEl.dataset.recipe);
  if (quickEl) setTab(quickEl.dataset.go);
  if (stockRowEl && state.tab === "stock") {
    const stock = state.stock.find((item) => item.id === stockRowEl.dataset.stockId);
    if (stock) openStockSheet(stock);
  }
  if (ingredientEl) {
    state.selectedIngredient = ingredientEl.dataset.ingredient;
    render();
  }
});

view.addEventListener("input", (event) => {
  if (event.target?.id === "searchRecipe") {
    state.search = event.target.value;
    renderRecipes();
  }
});

view.addEventListener("change", (event) => {
  if (event.target.matches("[data-plan-index]")) {
    const day = state.weekPlan[Number(event.target.dataset.planIndex)];
    day[event.target.dataset.meal] = event.target.value;
    renderPlan();
  }
  if (event.target.matches("[data-shopping]")) {
    const name = event.target.dataset.shopping;
    if (event.target.checked) state.purchased.add(name);
    else state.purchased.delete(name);
    renderPlan();
  }
});

sheet.addEventListener("click", (event) => {
  if (event.target === sheet) closeSheet();
  const tagButton = event.target.closest("[data-form-tag]");
  if (tagButton) {
    sheet.querySelectorAll("[data-form-tag]").forEach((button) => button.classList.remove("active"));
    tagButton.classList.add("active");
  }
  const deleteStockButton = event.target.closest("[data-action='deleteStock']");
  if (deleteStockButton && state.editingStockId) {
    state.stock = state.stock.filter((item) => item.id !== state.editingStockId);
    closeSheet();
    render();
  }
});

sheet.addEventListener("change", async (event) => {
  if (!event.target.matches("[data-image-input]")) return;
  const preview = sheet.querySelector("[data-image-preview]");
  const file = event.target.files?.[0];
  if (!preview || !file) return;
  const dataUrl = await fileToDataUrl(file);
  preview.outerHTML = `<img class="image-preview-image" data-image-preview src="${escapeHtml(dataUrl)}" alt="菜谱图片预览" />`;
});

sheet.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.target.id === "recipeForm") {
    const isEditingRecipe = Boolean(state.editingRecipeId);
    const form = new FormData(event.target);
    const name = form.get("name").toString().trim();
    const ingredients = form
      .get("ingredients")
      .toString()
      .split(/[、,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const steps = form
      .get("steps")
      .toString()
      .split(/\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const activeTag = sheet.querySelector("[data-form-tag].active").dataset.formTag;
    const imageFile = form.get("image");
    const existingImage = state.editingRecipeId ? recipeImageSrc(recipeById(state.editingRecipeId)) : "";
    const image = imageFile instanceof File && imageFile.size > 0 ? await fileToDataUrl(imageFile) : existingImage;
    const payload = {
      name,
      tag: activeTag,
      minutes: activeTag === "快菜" ? 20 : 45,
      favorite: false,
      ingredients,
      steps,
    };
    if (image) payload.image = image;
    if (state.editingRecipeId) {
      const target = recipeById(state.editingRecipeId);
      if (target) Object.assign(target, payload);
    } else {
      recipes.unshift({
        id: `custom-${Date.now()}`,
        ...payload,
      });
      state.tab = "today";
      document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === "today"));
    }
    closeSheet();
    render();
    showToast(isEditingRecipe ? "菜谱已更新" : "菜谱已保存");
  }
  if (event.target.id === "stockForm") {
    const form = new FormData(event.target);
    const payload = {
      name: form.get("name").toString().trim(),
      qty: form.get("qty").toString().trim(),
    };
    if (state.editingStockId) {
      const target = state.stock.find((item) => item.id === state.editingStockId);
      if (target) Object.assign(target, payload);
    } else {
      state.stock.unshift({
        id: `stock-${Date.now()}`,
        ...payload,
        purchasedAt: todayKey(),
      });
    }
    state.editingStockId = null;
    closeSheet();
    render();
    showToast("库存已保存");
  }
});

render();
