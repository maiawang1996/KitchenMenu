const TAB_META = {
  today: { label: "今天", icon: "sun" },
  recipes: { label: "菜谱", icon: "book" },
  plan: { label: "菜单", icon: "calendar" },
  journal: { label: "札记", icon: "note" },
  stock: { label: "库存", icon: "pantry" },
};

const DB_NAME = "KitchenMenuDB";
const DB_STORE = "snapshot";
const DB_KEY = "app";
const CLOUD_SNAPSHOT_ENDPOINT = "/api/snapshot";
const CLOUD_IMAGE_ENDPOINT = "/api/image";
const RECIPE_IMAGE_TARGET_BYTES = 350 * 1024;
const RECIPE_TAG_OPTIONS = ["快菜", "慢菜", "宝贝"];

const defaultRecipes = [
  {
    id: "tomato-egg",
    name: "番茄炒蛋",
    tag: "快菜",
    favorite: true,
    image: "./assets/tomato-egg-jelly.png",
    ingredients: ["番茄", "鸡蛋", "葱"],
    steps: ["番茄切块，鸡蛋打散。", "热锅炒蛋至凝固后盛出。", "番茄炒出汁，倒回鸡蛋，加盐和葱花。"],
  },
  {
    id: "beef-potato",
    name: "土豆牛肉",
    tag: "慢菜",
    favorite: false,
    image: "./assets/beef-potato-jelly.png",
    ingredients: ["牛肉", "土豆", "胡萝卜", "洋葱"],
    steps: ["牛肉焯水，土豆和胡萝卜切块。", "洋葱炒香后加入牛肉和调味料。", "加水炖至收汁，放入土豆。"],
  },
];

function cloneData(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function normalizeRecipe(recipe) {
  if (!recipe) return recipe;
  const { minutes, ...rest } = recipe;
  const tags = Array.from(
    new Set(
      (Array.isArray(rest.tags) ? rest.tags : [rest.tag])
        .map((tag) => String(tag || "").trim())
        .filter(Boolean),
    ),
  );
  return {
    ...rest,
    tag: tags[0] || "",
    tags,
    ingredients: Array.isArray(rest.ingredients) ? rest.ingredients : [],
    steps: Array.isArray(rest.steps) ? rest.steps : [],
  };
}

function recipeTags(recipe) {
  if (Array.isArray(recipe?.tags)) return recipe.tags.filter(Boolean);
  return recipe?.tag ? [recipe.tag] : [];
}

function recipeHasTag(recipe, tag) {
  return recipeTags(recipe).includes(tag);
}

function recipeTagText(recipe) {
  return recipeTags(recipe).join(" · ") || "未分类";
}

function recipeTagChips(recipe) {
  return recipeTags(recipe)
    .map((tag) => `<span class="tag ${tag === "慢菜" ? "slow" : ""} ${tag === "宝贝" ? "baby" : ""}">${escapeHtml(tag)}</span>`)
    .join("");
}

function normalizeWeekPlanDay(day = {}) {
  return {
    date: day.date,
    meal: day.meal || day.recipeId || day.lunch || day.dinner || "",
  };
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  if (Array.isArray(snapshot.recipes)) {
    snapshot.recipes = snapshot.recipes.map((recipe) => normalizeRecipe(recipe));
  }
  return snapshot;
}

function normalizeCloudSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const next = { ...snapshot };
  if (Array.isArray(next.recipes)) {
    next.recipes = next.recipes.map((recipe) => normalizeRecipe(recipe));
  }
  if (!Array.isArray(next.stock) && Array.isArray(next.state?.stock)) {
    next.stock = cloneData(next.state.stock);
  }
  return next;
}

function sharedSnapshotTime(snapshot) {
  const value = snapshot?.sharedSavedAt || snapshot?.savedAt || snapshot?.updatedAt || "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function snapshotTime(snapshot) {
  const value = snapshot?.savedAt || snapshot?.updatedAt || snapshot?.state?.savedAt || "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function selectLatestSnapshot(localSnapshot, cloudSnapshot) {
  if (localSnapshot && cloudSnapshot) {
    return snapshotTime(localSnapshot) >= snapshotTime(cloudSnapshot) ? localSnapshot : cloudSnapshot;
  }
  return localSnapshot || cloudSnapshot || null;
}

function createDefaultState() {
  return {
  tab: "today",
  detailId: null,
  editingRecipeId: null,
  editingStockId: null,
  search: "",
  searchComposing: false,
  babyOnly: false,
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
    { date: "周一", meal: "tomato-egg" },
    { date: "周二", meal: "tomato-egg" },
    { date: "周三", meal: "beef-potato" },
    { date: "周四", meal: "tomato-egg" },
    { date: "周五", meal: "beef-potato" },
    { date: "周六", meal: "" },
    { date: "周日", meal: "" },
  ],
  purchased: new Set(["米饭"]),
  };
}

let recipes = cloneData(defaultRecipes);
let state = createDefaultState();
let imageCropState = null;
let recipeLongPressState = null;
let suppressRecipeClickId = null;
let suppressRecipeClickUntil = 0;
let lastSharedSavedAt = 0;
let pendingCloudSync = false;
let deletedRecipeIds = new Set();

const view = document.querySelector("#view");
const pageTitle = document.querySelector("#pageTitle");
const todayText = document.querySelector("#todayText");
const sheet = document.querySelector("#sheet");
const sheetContent = document.querySelector("#sheetContent");

todayText.textContent = currentDateLabel();

let dbPromise = null;

function getDatabase() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Failed to open database"));
    });
  }
  return dbPromise;
}

function readFallbackSnapshot() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeFallbackSnapshot(snapshot) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures in private mode or quota errors.
  }
}

async function readSnapshot() {
  const fallback = readFallbackSnapshot();
  try {
    const db = await getDatabase();
    if (!db) return fallback;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const request = tx.objectStore(DB_STORE).get(DB_KEY);
      request.onsuccess = () => resolve(request.result || fallback);
      request.onerror = () => reject(request.error || new Error("Failed to read database"));
    });
  } catch {
    return fallback;
  }
}

async function writeSnapshot(snapshot) {
  try {
    const db = await getDatabase();
    if (!db) {
      writeFallbackSnapshot(snapshot);
      return;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(snapshot, DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to write database"));
    });
  } catch {
    writeFallbackSnapshot(snapshot);
  }
}

async function readCloudSnapshot() {
  try {
    const response = await fetch(CLOUD_SNAPSHOT_ENDPOINT, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const raw = await response.text();
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = { error: raw || null };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload?.error || payload?.message || payload?.details || payload?.hint || "无法读取云端快照",
        message: payload?.message || null,
        details: payload?.details || null,
        hint: payload?.hint || null,
      };
    }
    return {
      ok: true,
      snapshot: normalizeCloudSnapshot(payload?.snapshot || null),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error: "网络请求失败",
    };
  }
}

async function writeCloudSnapshot(snapshot) {
  try {
    const response = await fetch(CLOUD_SNAPSHOT_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ snapshot: normalizeCloudSnapshot(cloudSnapshotPayload(snapshot)) }),
    });
    const raw = await response.text();
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = { error: raw || null };
    }
    if (!response.ok) {
      const responseText = [payload?.error, payload?.message, payload?.details, payload?.hint].filter(Boolean).join(" ").toLowerCase();
      if (response.status === 413 || responseText.includes("entity too large")) {
        const fallbackResponse = await fetch(CLOUD_SNAPSHOT_ENDPOINT, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ snapshot: normalizeCloudSnapshot(cloudSnapshotPayload(snapshot, { stripRecipeImages: true })) }),
        });
        const fallbackRaw = await fallbackResponse.text();
        let fallbackPayload = null;
        try {
          fallbackPayload = fallbackRaw ? JSON.parse(fallbackRaw) : null;
        } catch {
          fallbackPayload = { error: fallbackRaw || null };
        }
        return {
          ok: fallbackResponse.ok,
          status: fallbackResponse.status,
          updatedAt: fallbackPayload?.updatedAt || null,
          error: fallbackPayload?.error || fallbackPayload?.message || fallbackPayload?.details || fallbackPayload?.hint || (fallbackResponse.ok ? "" : "云端保存失败"),
          message: fallbackPayload?.message || null,
          details: fallbackPayload?.details || null,
          hint: fallbackPayload?.hint || null,
        };
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      updatedAt: payload?.updatedAt || null,
      error: payload?.error || payload?.message || payload?.details || payload?.hint || (response.ok ? "" : "云端保存失败"),
      message: payload?.message || null,
      details: payload?.details || null,
      hint: payload?.hint || null,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error: "网络请求失败",
    };
  }
}

async function uploadRecipeImage(dataUrl, recipeId) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return { ok: true, url: dataUrl };
  }
  try {
    const response = await fetch(CLOUD_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dataUrl, recipeId }),
    });
    const raw = await response.text();
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = { error: raw || null };
    }
    return {
      ok: response.ok && Boolean(payload?.url),
      status: response.status,
      url: payload?.url || "",
      error: payload?.error || payload?.message || (response.ok ? "图片地址无效" : "图片上传失败"),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      url: "",
      error: "图片上传网络请求失败",
    };
  }
}

async function uploadPendingRecipeImages() {
  const failures = [];
  let changed = false;
  for (const recipe of recipes) {
    if (typeof recipe?.image !== "string" || !recipe.image.startsWith("data:image/")) continue;
    const result = await uploadRecipeImage(recipe.image, recipe.id);
    if (result.ok) {
      recipe.image = result.url;
      changed = true;
    } else {
      failures.push(`${recipe.name}：${result.error}`);
    }
  }
  return { changed, failures };
}

function serializeState() {
  return {
    stock: cloneData(state.stock),
    cooked: cloneData(state.cooked),
    weekPlan: cloneData(state.weekPlan),
    purchased: Array.from(state.purchased),
  };
}

function serializeLocalSnapshot({ updateSharedSavedAt = false } = {}) {
  const savedAt = new Date().toISOString();
  const snapshot = {
    recipes: cloneData(recipes).map((recipe) => normalizeRecipe(recipe)),
    state: serializeState(),
    deletedRecipeIds: Array.from(deletedRecipeIds),
    pendingCloudSync,
    savedAt,
  };
  if (updateSharedSavedAt) {
    snapshot.sharedSavedAt = savedAt;
  } else if (lastSharedSavedAt) {
    snapshot.sharedSavedAt = new Date(lastSharedSavedAt).toISOString();
  }
  return snapshot;
}

function serializeCloudSnapshot() {
  return {
    recipes: cloneData(recipes).map((recipe) => normalizeRecipe(recipe)),
    stock: cloneData(state.stock),
    deletedRecipeIds: Array.from(deletedRecipeIds),
    savedAt: new Date().toISOString(),
  };
}

function cloudSnapshotPayload(snapshot, { stripRecipeImages = false } = {}) {
  const payload = { ...cloneData(snapshot) };
  if (Array.isArray(payload.recipes)) {
    payload.recipes = payload.recipes.map((recipe) => {
      if (!recipe || typeof recipe !== "object") return recipe;
      const image = typeof recipe.image === "string" ? recipe.image : "";
      if (stripRecipeImages && image.startsWith("data:image/")) {
        const { image: _image, ...rest } = recipe;
        return rest;
      }
      return recipe;
    });
  }
  if (!Array.isArray(payload.stock) && Array.isArray(payload.state?.stock)) {
    payload.stock = cloneData(payload.state.stock);
  }
  delete payload.state;
  return payload;
}

function applyLocalSnapshot(snapshot) {
  if (!snapshot) return false;
  if (Array.isArray(snapshot.recipes)) {
    recipes = cloneData(snapshot.recipes).map((recipe) => normalizeRecipe(recipe));
  }
  const nextState = createDefaultState();
  if (snapshot.state) {
    if (Array.isArray(snapshot.state.stock)) nextState.stock = cloneData(snapshot.state.stock);
    if (Array.isArray(snapshot.state.cooked)) nextState.cooked = cloneData(snapshot.state.cooked);
    if (Array.isArray(snapshot.state.weekPlan)) {
      nextState.weekPlan = cloneData(snapshot.state.weekPlan).map(normalizeWeekPlanDay);
    }
    if (Array.isArray(snapshot.state.purchased)) nextState.purchased = new Set(snapshot.state.purchased);
  }
  state.stock = nextState.stock;
  state.cooked = nextState.cooked;
  state.weekPlan = nextState.weekPlan;
  state.purchased = nextState.purchased;
  deletedRecipeIds = new Set(Array.isArray(snapshot.deletedRecipeIds) ? snapshot.deletedRecipeIds : []);
  pendingCloudSync = Boolean(snapshot.pendingCloudSync);
  lastSharedSavedAt = sharedSnapshotTime(snapshot);
  return true;
}

function applyCloudSnapshot(snapshot) {
  if (!snapshot) return false;
  if (Array.isArray(snapshot.recipes)) {
    const localRecipes = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    recipes = cloneData(snapshot.recipes).map((recipe) => {
      const normalized = normalizeRecipe(recipe);
      const localRecipe = localRecipes.get(normalized.id);
      if (!localRecipe) return normalized;
      return {
        ...localRecipe,
        ...normalized,
        image: normalized.image || localRecipe.image,
      };
    });
  }
  if (Array.isArray(snapshot.stock)) {
    state.stock = cloneData(snapshot.stock);
  }
  deletedRecipeIds = new Set(Array.isArray(snapshot.deletedRecipeIds) ? snapshot.deletedRecipeIds : []);
  recipes = recipes.filter((recipe) => !deletedRecipeIds.has(recipe.id));
  pendingCloudSync = false;
  lastSharedSavedAt = sharedSnapshotTime(snapshot);
  return true;
}

function localHasRecipesMissingFromCloud(localSnapshot, cloudSnapshot) {
  if (!Array.isArray(localSnapshot?.recipes) || !Array.isArray(cloudSnapshot?.recipes)) return false;
  const cloudIds = new Set(cloudSnapshot.recipes.map((recipe) => recipe.id));
  const cloudDeleted = new Set(Array.isArray(cloudSnapshot.deletedRecipeIds) ? cloudSnapshot.deletedRecipeIds : []);
  return localSnapshot.recipes.some((recipe) => !cloudIds.has(recipe.id) && !cloudDeleted.has(recipe.id));
}

function mergeCloudIntoPendingLocal(cloudSnapshot) {
  if (!cloudSnapshot) return;
  const localRecipes = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const mergedDeleted = new Set([
    ...(Array.isArray(cloudSnapshot.deletedRecipeIds) ? cloudSnapshot.deletedRecipeIds : []),
    ...deletedRecipeIds,
  ]);
  for (const cloudRecipe of Array.isArray(cloudSnapshot.recipes) ? cloudSnapshot.recipes : []) {
    if (!localRecipes.has(cloudRecipe.id) && !mergedDeleted.has(cloudRecipe.id)) {
      localRecipes.set(cloudRecipe.id, normalizeRecipe(cloneData(cloudRecipe)));
    }
  }
  recipes = Array.from(localRecipes.values()).filter((recipe) => !mergedDeleted.has(recipe.id));
  deletedRecipeIds = mergedDeleted;
}

async function hydrateApp() {
  const [cloudResult, localSnapshot] = await Promise.all([readCloudSnapshot(), readSnapshot()]);
  const cloudSnapshot = cloudResult?.ok ? normalizeCloudSnapshot(cloudResult.snapshot) : null;

  if (localSnapshot) {
    applyLocalSnapshot(localSnapshot);
  }

  const localSharedTime = lastSharedSavedAt || 0;
  const cloudSharedTime = sharedSnapshotTime(cloudSnapshot);
  const needsRecoverySync =
    Boolean(localSnapshot) &&
    (pendingCloudSync || localHasRecipesMissingFromCloud(localSnapshot, cloudSnapshot));

  if (cloudSnapshot && !localSnapshot) {
    applyCloudSnapshot(cloudSnapshot);
  } else if (cloudSnapshot && needsRecoverySync) {
    mergeCloudIntoPendingLocal(cloudSnapshot);
    pendingCloudSync = true;
  } else if (cloudSnapshot && cloudSharedTime > localSharedTime) {
    applyCloudSnapshot(cloudSnapshot);
  }

  const localToPersist = serializeLocalSnapshot();
  writeFallbackSnapshot(localToPersist);
  void writeSnapshot(localToPersist);

  if (needsRecoverySync) {
    void saveApp({ syncCloud: true, sharedChanged: true });
  }
}

async function saveApp({ syncCloud = true, sharedChanged = false } = {}) {
  pendingCloudSync = syncCloud ? true : pendingCloudSync;
  const localSnapshot = serializeLocalSnapshot();
  writeFallbackSnapshot(localSnapshot);
  void writeSnapshot(localSnapshot);
  if (!syncCloud) {
    return { ok: true, status: 0, skipped: true };
  }
  const imageResult = await uploadPendingRecipeImages();
  if (imageResult.changed) {
    const imageSnapshot = serializeLocalSnapshot();
    writeFallbackSnapshot(imageSnapshot);
    void writeSnapshot(imageSnapshot);
  }
  const cloudResult = await writeCloudSnapshot(serializeCloudSnapshot());
  if (!cloudResult.ok) {
    return cloudResult;
  }
  pendingCloudSync = imageResult.failures.length > 0;
  lastSharedSavedAt = Date.parse(cloudResult.updatedAt || new Date().toISOString());
  const syncedSnapshot = serializeLocalSnapshot({ updateSharedSavedAt: sharedChanged });
  writeFallbackSnapshot(syncedSnapshot);
  void writeSnapshot(syncedSnapshot);
  if (imageResult.failures.length > 0) {
    return {
      ok: false,
      status: 0,
      error: imageResult.failures.join("；"),
    };
  }
  return cloudResult;
}

function registerPwa() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

function iconSvg(name) {
  const icons = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>',
    arrowRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>',
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
    branch: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M35 82c12-4 26-17 37-32" />
        <path d="M55 58c5 2 10 7 12 12" />
        <path d="M67 46c5 1 10 4 14 8" />
        <path d="M78 34c5 2 9 6 12 11" />
        <path d="M59 61c-5-1-10-5-13-10" />
        <path d="M46 71c-5-1-10-4-14-8" />
        <path d="M40 43c4 1 7 3 10 6" />
        <path d="M76 34c2-4 6-7 11-8" />
        <circle cx="87" cy="25" r="2.4" />
        <circle cx="97" cy="30" r="2.4" />
        <circle cx="82" cy="42" r="2.4" />
      </svg>
    `,
    recipeBook: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M28 33h31c6 0 11 5 11 11v42H39c-6 0-11 5-11 11V44c0-6 5-11 11-11Z" />
        <path d="M59 44h32c6 0 11 5 11 11v42H70c-6 0-11 5-11 11V55c0-6 0-11 0-11Z" />
        <path d="M40 45h15M40 56h15M40 67h10" />
        <path d="M70 56h16M70 67h16M70 78h12" />
        <path d="M55 28l8 10 8-10" />
        <path d="M68 82l11 18 9-4" />
      </svg>
    `,
    pantryBasket: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M33 53h54l-5 31c0 5-4 9-9 9H47c-5 0-9-4-9-9l-5-31Z" />
        <path d="M43 53c0-12 6-21 17-21s17 9 17 21" />
        <path d="M43 53h34" />
        <path d="M43 64h34M45 75h30" />
        <path d="M30 53h60" />
      </svg>
    `,
    favoriteBook: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M31 30h30c7 0 12 5 12 12v46H43c-6 0-12 5-12 12V42c0-7 0-12 0-12Z" />
        <path d="M61 42h28c7 0 12 5 12 12v46H73c-6 0-12 5-12 12V54c0-7 0-12 0-12Z" />
        <path d="M48 70c0-8 8-13 12-13s12 5 12 13c0 9-12 17-12 17s-12-8-12-17Z" />
      </svg>
    `,
    notePlant: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M61 88V62" />
        <path d="M61 63c-10 0-17-6-19-16 10 1 18 4 24 10" />
        <path d="M61 63c10 0 17-6 19-16-10 1-18 4-24 10" />
        <path d="M46 88h30" />
        <path d="M41 88c3 9 10 16 20 16s17-7 20-16" />
        <path d="M82 47c4-4 8-5 13-5" />
        <path d="M89 42c0 5 0 8 3 12" />
      </svg>
    `,
    egg: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <ellipse cx="46" cy="66" rx="18" ry="24" />
        <ellipse cx="74" cy="66" rx="18" ry="24" />
        <path d="M33 66h26M61 66h26" />
        <path d="M37 55c3-8 7-12 12-12" />
      </svg>
    `,
    tomato: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="68" r="23" />
        <path d="M60 44v-9M50 47c3 0 7 2 10 5 3-3 7-5 10-5" />
        <path d="M46 52c4 2 9 4 14 4s10-2 14-4" />
        <path d="M53 50c2-5 4-7 7-8" />
      </svg>
    `,
    beef: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M31 66c0-16 11-28 27-28h8c16 0 23 10 23 22 0 17-12 30-29 30H53c-12 0-22-9-22-24Z" />
        <path d="M42 52c10 7 19 10 32 11" />
        <path d="M40 71c12 5 23 7 40 6" />
        <path d="M50 43c2 9 1 17-2 28" />
      </svg>
    `,
    onion: `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M60 33c13 11 23 23 23 38 0 16-10 27-23 27S37 87 37 71c0-15 10-27 23-38Z" />
        <path d="M60 33c0 10 0 17-3 25" />
        <path d="M60 33c0 10 0 17 3 25" />
        <path d="M52 40c4 3 8 4 8 4s4-1 8-4" />
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

function sectionTitle(title, accent = "notebook") {
  return `
    <span class="section-badge" aria-hidden="true"></span>
    <h2 class="section-title-text">${title}</h2>
    <span class="section-accent" aria-hidden="true">${doodleSvg(accent)}</span>
  `;
}

function sectionHeader(title, meta = "", accent = "notebook", action = "") {
  return `
    <div class="section-head">
      <div class="section-title-wrap">
        ${sectionTitle(title, accent)}
        ${meta ? `<span class="section-meta">${meta}</span>` : ""}
      </div>
      ${action ? `<div class="section-action">${action}</div>` : ""}
    </div>
  `;
}

function stockIllustration(name) {
  const value = String(name || "");
  if (value.includes("鸡蛋")) return `<img class="stock-art-image" src="./assets/stock-egg.png" alt="" aria-hidden="true" />`;
  if (value.includes("番茄")) return `<img class="stock-art-image" src="./assets/stock-tomato.png" alt="" aria-hidden="true" />`;
  if (value.includes("牛肉")) return `<img class="stock-art-image" src="./assets/stock-beef.png" alt="" aria-hidden="true" />`;
  if (value.includes("洋葱")) return `<img class="stock-art-image" src="./assets/stock-onion.png" alt="" aria-hidden="true" />`;
  return doodleSvg("branch");
}

function homePlanCard(entries) {
  if (!entries.length) {
    return `
      <article class="home-plan-card home-plan-empty" data-action="openPlanRecipePicker">
        <div class="home-plan-art"><img class="home-plan-book-image" src="./assets/home-plan-book.png" alt="" aria-hidden="true" /></div>
        <div class="home-plan-copy">
          <h3>今天还没有安排菜谱</h3>
          <button class="home-plan-cta" type="button" data-action="openPlanRecipePicker">＋ 选择菜谱</button>
        </div>
      </article>
    `;
  }
  const items = entries.slice(0, 2).map((entry) => `
    <article class="home-plan-item" data-action="detail" data-id="${entry.recipe.id}">
      <div class="home-plan-item-copy">
        <strong>${entry.recipe.name}</strong>
        <span>${recipeTagText(entry.recipe)}</span>
      </div>
      <span class="home-plan-item-arrow" aria-hidden="true">${iconSvg("arrowRight")}</span>
    </article>
  `).join('');
  return `
    <article class="home-plan-card home-plan-filled">
      <div class="home-plan-list">${items}</div>
      <div class="home-plan-actions">
        <button class="home-plan-ghost" type="button" data-action="openPlanRecipePicker">重新选择</button>
        <button class="home-plan-ghost" type="button" data-action="clearTodayPlan">取消计划</button>
      </div>
    </article>
  `;
}

function homePantryCard(item) {
  return `
    <article class="home-pantry-card" data-go="stock" data-stock-id="${item.id}">
      <div class="home-pantry-art" aria-hidden="true">${stockIllustration(item.name)}</div>
      <div class="home-pantry-copy">
        <strong>${item.name}</strong>
        <span>${item.qty || "未填数量"}</span>
      </div>
      <div class="home-pantry-age">${stockAgeText(item)}</div>
    </article>
  `;
}

function homeFavoriteRow(recipe) {
  return `
    <article class="favorite-row" data-recipe="${recipe.id}">
      <div class="favorite-photo">${recipeMedia(recipe, "favorite", recipe.name)}</div>
      <div class="favorite-copy">
        <h3>${recipe.name}</h3>
        <p>${recipeTagText(recipe)}</p>
      </div>
      <button class="favorite-heart" type="button" data-action="toggleFavorite" data-id="${recipe.id}" aria-label="${recipe.favorite ? "取消收藏" : "收藏"}">${recipe.favorite ? "♡" : "♡"}</button>
    </article>
  `;
}

function dailyNoteShortcut(recipe) {
  return `
    <article class="home-note" data-go="journal">
      <div class="home-note-art" aria-hidden="true">${doodleSvg("notePlant")}</div>
      <div class="home-note-copy">
        <h3>今日小记</h3>
        <p>记录一点厨房的小确幸吧♡</p>
      </div>
      <div class="home-note-arrow" aria-hidden="true">${iconSvg("arrowRight")}</div>
    </article>
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
  const branch = document.querySelector("#topbarBranch");
  if (branch) branch.innerHTML = doodleSvg("branch");
  document.querySelectorAll(".tab").forEach((button) => {
    const meta = TAB_META[button.dataset.tab];
    if (!meta) return;
    button.innerHTML = `${iconSvg(meta.icon)}<small>${meta.label}</small>`;
  });
}

function currentDateLabel() {
  const date = new Date();
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekdayLongLabel(date)}`;
}

function weekdayLabel(date = new Date()) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
}

function weekdayLongLabel(date = new Date()) {
  return ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][date.getDay()];
}

function todayPlan() {
  return state.weekPlan.find((item) => item.date === weekdayLabel()) || state.weekPlan[0];
}

function todayPlanRecipeId(plan = todayPlan()) {
  return plan?.meal || "";
}

function recipeById(id) {
  return recipes.find((recipe) => recipe.id === id);
}

function recipeImageSrc(recipe) {
  return recipe?.image || "";
}

function recipeMedia(recipe, variant = "recipe", alt = "", extraAttrs = "", overrideSrc = "") {
  const src = overrideSrc || recipeImageSrc(recipe);
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

function normalizeSearchTerm(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000、,，.。·\-_/|()（）[\]{}'"“”‘’!?！？:：;；]/g, "");
}

function recipeSearchText(recipe) {
  const steps = Array.isArray(recipe?.steps) ? recipe.steps.join("") : "";
  return normalizeSearchTerm(`${recipe?.name || ""}${recipe?.ingredients?.join("") || ""}${recipeTags(recipe).join("")}${steps}`);
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getRecipeFormDraft(form) {
  const formData = new FormData(form);
  const tags = Array.from(sheet.querySelectorAll("[data-form-tag].active")).map((button) => button.dataset.formTag);
  return {
    name: formData.get("name").toString().trim(),
    tag: tags[0] || "",
    tags,
    ingredients: formData
      .get("ingredients")
      .toString()
      .split(/[、,\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
    steps: formData
      .get("steps")
      .toString()
      .split(/\n/)
      .map((item) => item.trim())
      .filter(Boolean),
    image: form.dataset.currentImage || "",
  };
}

function recipeFormDefaults(recipe = null, draft = null) {
  return {
    name: draft?.name ?? recipe?.name ?? "",
    tags: draft?.tags ?? (recipe ? recipeTags(recipe) : ["快菜"]),
    ingredients: draft?.ingredients ?? recipe?.ingredients ?? [],
    steps: draft?.steps ?? recipe?.steps ?? [],
    image: draft?.image ?? recipeImageSrc(recipe) ?? "",
  };
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("图片压缩失败"));
      },
      "image/jpeg",
      quality,
    );
  });
}

async function cropImageToSquare(imageEl, cropState) {
  const canvas = document.createElement("canvas");
  const scale = cropState.baseScale * cropState.zoom;
  const sourceX = clamp(-cropState.offsetX / scale, 0, imageEl.naturalWidth);
  const sourceY = clamp(-cropState.offsetY / scale, 0, imageEl.naturalHeight);
  const sourceSize = clamp(cropState.frameSize / scale, 1, Math.min(imageEl.naturalWidth - sourceX, imageEl.naturalHeight - sourceY));
  const sizes = [720, 640, 560];
  const qualities = [0.78, 0.7, 0.62, 0.54];
  let smallestBlob = null;

  for (const size of sizes) {
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageEl, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
    for (const quality of qualities) {
      const blob = await canvasToJpegBlob(canvas, quality);
      smallestBlob = blob;
      if (blob.size <= RECIPE_IMAGE_TARGET_BYTES) {
        return fileToDataUrl(blob);
      }
    }
  }

  return fileToDataUrl(smallestBlob);
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
      const quickBonus = recipeHasTag(recipe, "快菜") ? 10 : 2;
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
    `属于${recipeTagText(recipe)}，做起来比较顺手`,
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
async function addRecipeToTodayPlan(recipeId) {
  const recipe = recipeById(recipeId);
  if (!recipe) return;
  const plan = todayPlan();
  if (plan.meal === recipeId) {
    closeSheet();
    showToast(`今日菜单里已经有：${recipe.name}`);
    return;
  }
  plan.meal = recipeId;
  await saveApp({ syncCloud: false });
  closeSheet();
  render();
  showToast(`已加入今日菜单：${recipe.name}`);
}

async function clearTodayPlan() {
  const plan = todayPlan();
  if (!plan.meal) {
    closeSheet();
    showToast("今天还没有安排菜谱");
    return;
  }
  const current = recipeById(plan.meal);
  plan.meal = "";
  const cloudResult = await saveApp({ syncCloud: false });
  closeSheet();
  render();
  showToast(`已取消：${current?.name || "今日计划"}`);
}

function openPlanRecipePicker() {
  const available = recipes.slice();
  const currentMeal = todayPlanRecipeId();
  openSheet(`
    <h2>选择已有菜谱</h2>
    <p class="muted">点一下菜谱，就会加入今天的计划。</p>
    ${currentMeal ? '<button class="ghost-btn" type="button" data-action="clearTodayPlan" style="margin-bottom:12px">取消当前计划</button>' : ''}
    <div class="recipe-grid recipe-grid-home plan-picker-grid">
      ${available.map((recipe) => `
        <article class="card recipe-card recipe-card-compact plan-picker-card" data-action="addToTodayPlan" data-id="${recipe.id}">
          <div class="recipe-thumb" aria-hidden="true">
            ${recipeMedia(recipe, "recipe-thumb", recipe.name)}
          </div>
          <div class="recipe-body">
            <h3>${recipe.name}</h3>
            <p class="recipe-meta">${recipeTagText(recipe)}</p>
          </div>
        </article>
      `).join("")}
    </div>
  `);
}

function openRecipeQuickActions(recipeId) {
  const recipe = recipeById(recipeId);
  if (!recipe) return;
  openSheet(`
    <div class="recipe-quick-action">
      <div class="recipe-quick-action-image">
        ${recipeMedia(recipe, "recipe-thumb", recipe.name)}
      </div>
      <div class="recipe-quick-action-copy">
        <p class="muted">今日菜单</p>
        <h2>${recipe.name}</h2>
      </div>
      <button class="primary-btn" type="button" data-action="addToTodayPlan" data-id="${recipe.id}">加入今日菜单</button>
    </div>
  `);
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText =
    "position:fixed;left:50%;bottom:92px;z-index:60;transform:translateX(-50%);max-width:88%;padding:11px 14px;border-radius:999px;background:#f1eadf;color:#3c3528;font-weight:700;box-shadow:0 8px 18px rgba(86,68,46,.08);border:1px solid rgba(185,165,135,.25)";
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 1700);
}

function setRecipeSaveLoading(button) {
  if (!button) return;
  button.disabled = true;
  button.classList.add("is-saving");
  button.innerHTML = '<span class="save-spinner" aria-hidden="true"></span><span>保存中...</span>';
}

function showRecipeSaveSuccess(message) {
  const notice = document.createElement("div");
  notice.className = "recipe-save-success";
  notice.setAttribute("role", "status");
  notice.innerHTML = `
    <span class="recipe-save-success-icon">${iconSvg("check")}</span>
    <strong>${escapeHtml(message)}</strong>
  `;
  document.body.appendChild(notice);
  window.setTimeout(() => notice.remove(), 2200);
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
        ${compact ? "" : `<div class="tag-row">${recipeTagChips(recipe)}${recipe.favorite ? '<span class="tag blue">收藏</span>' : ""}</div><p class="recipe-meta">${recipe.ingredients.join("、")}</p>`}
      </div>
    </article>
  `;
}

function renderToday() {
  pageTitle.textContent = "今天吃什么";
  const plan = todayPlan();
  const planEntries = [todayPlanRecipeId(plan)]
    .filter(Boolean)
    .map((id) => ({ recipe: recipeById(id) }))
    .filter((entry) => entry.recipe);
  const pantryItems = state.stock.slice(0, 5);
  const favorites = recipes.filter((recipe) => recipe.favorite).slice(0, 3);
  const recommendation = currentRecommendation().recipe;

  view.innerHTML = `
    <div class="today-page home-page">
      <section class="section">
        ${sectionHeader("今日计划", "TODAY", "checklist")}
        ${homePlanCard(planEntries)}
      </section>

      <section class="section">
        ${sectionHeader("库存提醒", "PANTRY", "pantryBasket", '<button class="section-link" data-go="stock">全部库存 <span aria-hidden="true">›</span></button>')}
        <div class="pantry-carousel">
          ${pantryItems.map((item) => homePantryCard(item)).join("") || emptyIllustration("今天还没有库存", "把买回来的食材记一下。", "sprout")}
        </div>
        ${pantryItems.length ? `<div class="carousel-dots" aria-hidden="true">${pantryItems.slice(0, 3).map((_, index) => `<span class="${index === 0 ? "active" : ""}"></span>`).join("")}</div>` : ""}
      </section>

      <section class="section">
        ${sectionHeader("收藏", `${favorites.length} 道`, "favoriteBook", '<button class="section-link" data-go="recipes">查看全部 <span aria-hidden="true">›</span></button>')}
        <div class="favorites-card">
          ${favorites.map((recipe) => homeFavoriteRow(recipe)).join("") || emptyIllustration("还没有收藏菜谱", "看到喜欢的菜就先存起来。", "favoriteBook")}
        </div>
      </section>

      <section class="section">
        ${dailyNoteShortcut(recommendation)}
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
  const query = normalizeSearchTerm(state.search);
  const filtered = recipes.filter((recipe) => {
    const matchesSearch = !query || recipeSearchText(recipe).includes(query);
    const matchesBabyFilter = !state.babyOnly || recipeHasTag(recipe, "宝贝");
    return matchesSearch && matchesBabyFilter;
  });
  view.innerHTML = `
    <div class="page-shell journal-page recipes-page">
      <section class="section">
        ${sectionHeader("菜谱札记", `${filtered.length} 道`, "favoriteBook")}
        <div class="paper-card search-shell" aria-label="搜索与筛选">
          <input class="search" id="searchRecipe" value="${escapeHtml(state.search)}" placeholder="搜索菜名、食材或标签" />
          <div class="recipe-filter-row" aria-label="菜谱筛选">
            <button
              class="recipe-filter-chip ${state.babyOnly ? "active" : ""}"
              type="button"
              data-action="toggleBabyFilter"
              aria-pressed="${state.babyOnly}"
            >宝贝</button>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="recipe-grid recipe-grid-home">
          ${filtered
              .map((recipe) => `
                <article class="card recipe-card recipe-card-compact" data-recipe="${recipe.id}">
                  <div class="recipe-thumb" aria-hidden="true">
                    ${recipeMedia(recipe, "recipe-thumb", recipe.name)}
                  </div>
                  <div class="recipe-body">
                    <h3>${recipe.name}</h3>
                  </div>
                </article>
              `)
              .join("") || emptyIllustration("没有找到相关菜谱", "换个关键词再看看。")}
        </div>
      </section>
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
        <div class="tag-row">${recipeTagChips(recipe)}</div>
      </div>
    </section>

    <section class="section paper-card">
      <h2>原材料</h2>
      ${
        recipe.ingredients.length
          ? `<ul class="plain-list">${recipe.ingredients.map((item) => `<li>${item}</li>`).join("")}</ul>`
          : '<p class="muted">还没有填写原材料。</p>'
      }
    </section>

    <section class="section paper-card">
      <h2>做法</h2>
      ${
        recipe.steps.length
          ? `<ol class="step-list">${recipe.steps.map((step, index) => `<li><span>${index + 1}</span><p>${step}</p></li>`).join("")}</ol>`
          : emptyIllustration("还没有写做法", "这道菜先记食材也可以，之后再补步骤。")
      }
    </section>

    <div class="detail-menu-action">
      <button class="primary-btn" type="button" data-action="addToTodayPlan" data-id="${recipe.id}">加入今日菜单</button>
    </div>
  `;
}

function renderPlan() {
  pageTitle.textContent = "一周菜单";
  view.innerHTML = `
    <div class="page-shell journal-page plan-page">
      <section class="section">
        ${sectionHeader("一周菜单", "WEEK PLAN", "calendar")}
        <div class="plan-list editorial-plan-list">
          ${state.weekPlan
            .map(
              (day, index) => `
                <article class="card plan-day editorial-day">
                  <div class="plan-day-head">
                    <h3>${day.date}</h3>
                  </div>
                  <div class="plan-day-body">
                    ${mealSelect(index, day.meal)}
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="section">
        ${sectionHeader("购物清单", "SHOPPING", "checklist")}
        <div class="shopping-list">
          ${shoppingItems().length ? shoppingItems().map(shoppingRow).join("") : emptyIllustration("购物清单还是空的", "把一周菜单先排上，就会自动生成。")}
        </div>
      </section>
    </div>
  `;
}
function mealSelect(index, selected) {
  return `
    <label class="meal-row">
      <select data-plan-index="${index}" data-meal="meal">
        <option value="">未安排</option>
        ${recipes.map((recipe) => `<option value="${recipe.id}" ${selected === recipe.id ? "selected" : ""}>${recipe.name}</option>`).join("")}
      </select>
    </label>
  `;
}

function shoppingItems() {
  const plannedIds = state.weekPlan.map((day) => day.meal).filter(Boolean);
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
    <div class="page-shell journal-page stock-page">
      <section class="section">
        <div class="section-head">
          ${sectionTitle("家里现有", "sprout")}
          <button class="pill-btn" data-action="addStock">添加</button>
        </div>
        <div class="stock-list editorial-stock-list">
          ${state.stock
            .map(
              (item) => `
                <article class="card stock-row editorial-stock-row" data-stock-id="${item.id}">
                  <div class="stock-row-art" aria-hidden="true">${stockIllustration(item.name)}</div>
                  <div class="list-main">
                    <strong>${item.name}</strong>
                    <span>${item.qty || "未填数量"} · ${stockAgeText(item)}</span>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="section">
        ${sectionHeader("食材索引", `${ingredients.length} 种`, "notebook")}
        <div class="tag-row editorial-chip-row">
          ${ingredients.map((name) => `<button class="chip tag ${selected === name ? "slow" : ""}" data-ingredient="${name}">${name}</button>`).join("")}
        </div>
      </section>

      <section class="section">
        ${sectionHeader(selected ? `${selected} 可以做` : "点一个食材看看", "", "meal")}
        ${selected
            ? `<div class="recipe-grid recipe-grid-home">${recipes
                .filter((recipe) => recipe.ingredients.includes(selected))
                .map((recipe) => recipeCard(recipe, { compact: true }))
                .join("") || emptyIllustration("暂时没有菜谱", "可以先新增一个同食材的菜。")}</div>`
            : emptyIllustration("还没有选食材", "点上面的食材名，看看能做什么。", "sprout")
        }
      </section>
    </div>
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
      ${sectionHeader("本周观察", "", "tea")}
      <div class="stats-grid">
        <div class="card stat-card paper-card"><b>${state.cooked.length}</b><span class="muted">最近做饭次数</span></div>
        <div class="card stat-card paper-card"><b>${topIngredient[1]}</b><span class="muted">${topIngredient[0]} 使用次数</span></div>
      </div>
    </section>

    <section class="section paper-card">
      ${sectionTitle("饮食建议", "sprout")}
      <p class="muted">本周最常做：${mostCookedId ? recipeById(mostCookedId).name : "暂无"}。牛肉类菜品偏多，可以在周菜单里增加青菜、番茄或香菇类菜，平衡蔬菜摄入。</p>
    </section>
  `;
}

function syncCropPreview() {
  if (!imageCropState) return;
  const image = sheet.querySelector("[data-crop-image]");
  const stage = sheet.querySelector("[data-crop-stage]");
  if (!image || !stage) return;
  const scale = imageCropState.baseScale * imageCropState.zoom;
  const displayWidth = imageCropState.imageWidth * scale;
  const displayHeight = imageCropState.imageHeight * scale;
  const minOffsetX = imageCropState.frameSize - displayWidth;
  const minOffsetY = imageCropState.frameSize - displayHeight;
  imageCropState.offsetX = clamp(imageCropState.offsetX, minOffsetX, 0);
  imageCropState.offsetY = clamp(imageCropState.offsetY, minOffsetY, 0);
  image.style.width = `${displayWidth}px`;
  image.style.height = `${displayHeight}px`;
  image.style.transform = `translate(${imageCropState.offsetX}px, ${imageCropState.offsetY}px)`;
  const zoomInput = sheet.querySelector("[data-crop-zoom]");
  if (zoomInput) zoomInput.value = String(imageCropState.zoom);
  const help = sheet.querySelector("[data-crop-help]");
  if (help) help.textContent = `${Math.round(imageCropState.zoom * 100)}%`;
}

function openImageCropSheet(source, draft, recipeId) {
  imageCropState = {
    source,
    draft,
    recipeId,
    imageWidth: 0,
    imageHeight: 0,
    frameSize: 0,
    baseScale: 1,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    dragging: null,
  };
  openSheet(`
    <h2>裁剪图片</h2>
    <p class="muted">拖动图片调整构图，滑块控制缩放，最后会保存成正方形。</p>
    <div class="cropper">
      <div class="crop-stage" data-crop-stage>
        <img data-crop-image src="${escapeHtml(source)}" alt="裁剪图片预览" />
      </div>
      <div class="crop-controls">
        <label>缩放 <span data-crop-help>100%</span></label>
        <input data-crop-zoom type="range" min="1" max="2.6" step="0.01" value="1" />
      </div>
      <div class="button-row">
        <button class="ghost-btn" type="button" data-action="cancelCrop">取消</button>
        <button class="primary-btn" type="button" data-action="applyCrop">使用裁剪</button>
      </div>
    </div>
  `);

  const stage = sheet.querySelector("[data-crop-stage]");
  const image = sheet.querySelector("[data-crop-image]");
  const slider = sheet.querySelector("[data-crop-zoom]");

  const initializeCrop = () => {
    if (!stage || !imageCropState || !image.naturalWidth || !image.naturalHeight) return;
    imageCropState.frameSize = stage.getBoundingClientRect().width;
    if (!imageCropState.frameSize) {
      requestAnimationFrame(initializeCrop);
      return;
    }
    imageCropState.imageWidth = image.naturalWidth;
    imageCropState.imageHeight = image.naturalHeight;
    imageCropState.baseScale = Math.max(imageCropState.frameSize / imageCropState.imageWidth, imageCropState.frameSize / imageCropState.imageHeight);
    imageCropState.zoom = 1;
    imageCropState.offsetX = (imageCropState.frameSize - imageCropState.imageWidth * imageCropState.baseScale) / 2;
    imageCropState.offsetY = (imageCropState.frameSize - imageCropState.imageHeight * imageCropState.baseScale) / 2;
    syncCropPreview();
  };

  if (image.complete) {
    requestAnimationFrame(initializeCrop);
  } else {
    image.addEventListener("load", initializeCrop, { once: true });
  }

  requestAnimationFrame(() => {
    imageCropState.frameSize = stage?.getBoundingClientRect().width || 0;
    if (image.complete) initializeCrop();
  });
}

function openRecipeSheet(recipe = null, draft = null) {
  state.editingRecipeId = recipe?.id ?? null;
  const values = recipeFormDefaults(recipe, draft);
  openSheet(`
    <h2>${recipe ? "编辑菜谱" : "新增菜谱"}</h2>
    <form class="form" id="recipeForm" data-current-image="${escapeHtml(values.image)}">
      <div class="field"><label>菜名</label><input name="name" required placeholder="例如：红烧牛肉" value="${escapeHtml(values.name)}" /></div>
      <div class="field">
        <label>图片</label>
        <div class="image-upload-row">
          ${
            values.image
              ? `<div class="image-preview image-preview-compact">${recipeMedia(recipe, "image-preview", "菜谱图片预览", "data-image-preview", values.image)}</div>`
              : ""
          }
          <label class="image-picker-button">
            ${iconSvg("image")}
            <span>${values.image ? "更换图片" : "选择图片"}</span>
            <input class="file-input-hidden" name="image" type="file" accept="image/*" data-image-input />
          </label>
        </div>
        <p class="muted">从手机相册选择图片，上传前会自动压缩。</p>
      </div>
      <div class="field">
        <label>标签（可多选）</label>
        <div class="segmented tag-selector">
          ${RECIPE_TAG_OPTIONS.map(
            (tag) =>
              `<button type="button" class="${values.tags.includes(tag) ? "active" : ""}" data-form-tag="${tag}" aria-pressed="${values.tags.includes(tag)}">${tag}</button>`,
          ).join("")}
        </div>
      </div>
      <div class="field"><label>原材料（可选）</label><textarea name="ingredients" placeholder="用顿号或换行分隔，例如：牛肉、土豆、洋葱">${escapeHtml(values.ingredients.join("、"))}</textarea></div>
      <div class="field"><label>做法（可选）</label><textarea name="steps" placeholder="每一步换一行，留空也可以">${escapeHtml(values.steps.join("\n"))}</textarea></div>
      <button class="primary-btn" type="submit">保存菜谱</button>
      ${recipe ? '<button class="ghost-btn" type="button" data-action="deleteRecipe">删除菜谱</button>' : ""}
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
  document.body.dataset.tab = state.tab;
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

function clearRecipeLongPress() {
  if (recipeLongPressState?.timer) {
    window.clearTimeout(recipeLongPressState.timer);
  }
  recipeLongPressState = null;
}

view.addEventListener("pointerdown", (event) => {
  const thumb = event.target.closest(".recipes-page .recipe-card-compact .recipe-thumb");
  const card = thumb?.closest("[data-recipe]");
  if (!card) return;
  clearRecipeLongPress();
  const recipeId = card.dataset.recipe;
  recipeLongPressState = {
    pointerId: event.pointerId,
    recipeId,
    startX: event.clientX,
    startY: event.clientY,
    timer: window.setTimeout(() => {
      suppressRecipeClickId = recipeId;
      suppressRecipeClickUntil = Date.now() + 900;
      recipeLongPressState = null;
      openRecipeQuickActions(recipeId);
    }, 560),
  };
});

view.addEventListener("pointermove", (event) => {
  if (!recipeLongPressState || event.pointerId !== recipeLongPressState.pointerId) return;
  const dx = event.clientX - recipeLongPressState.startX;
  const dy = event.clientY - recipeLongPressState.startY;
  if (Math.hypot(dx, dy) > 10) clearRecipeLongPress();
});

view.addEventListener("pointerup", (event) => {
  if (recipeLongPressState?.pointerId === event.pointerId) clearRecipeLongPress();
});

view.addEventListener("pointercancel", clearRecipeLongPress);
view.addEventListener("scroll", clearRecipeLongPress, { passive: true });

view.addEventListener("contextmenu", (event) => {
  if (event.target.closest(".recipes-page .recipe-card-compact .recipe-thumb")) {
    event.preventDefault();
  }
});

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
    if (action === "toggleBabyFilter") {
      state.babyOnly = !state.babyOnly;
      renderRecipes();
    }
    if (action === "backRecipes") {
      state.detailId = null;
      render();
    }
    if (action === "addRecipe") openRecipeSheet();
    if (action === "openPlanRecipePicker") openPlanRecipePicker();
    if (action === "addToTodayPlan") void addRecipeToTodayPlan(id);
    if (action === "clearTodayPlan") void clearTodayPlan();
    if (action === "editRecipe") {
      const recipe = recipeById(recipeId || id);
      if (recipe) openRecipeSheet(recipe);
    }
    if (action === "toggleFavorite") {
      const recipe = recipeById(id);
      if (recipe) {
        recipe.favorite = !recipe.favorite;
        void saveApp({ syncCloud: true, sharedChanged: true });
        render();
      }
    }
    if (action === "addStock") openStockSheet();
    if (action === "editStock") {
      const stock = state.stock.find((item) => item.id === id || item.id === actionEl.dataset.stockId);
      if (stock) openStockSheet(stock);
    }
    if (action === "deleteStock" && state.editingStockId) {
      state.stock = state.stock.filter((item) => item.id !== state.editingStockId);
      void saveApp({ syncCloud: false });
      closeSheet();
      render();
    }
    return;
  }

  if (recipeCardEl) {
    const recipeId = recipeCardEl.dataset.recipe;
    if (suppressRecipeClickId === recipeId && Date.now() < suppressRecipeClickUntil) {
      suppressRecipeClickId = null;
      suppressRecipeClickUntil = 0;
      return;
    }
    openDetail(recipeId);
  }
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
    if (state.searchComposing || event.isComposing) return;
    state.search = event.target.value;
    renderRecipes();
  }
});

view.addEventListener("compositionstart", (event) => {
  if (event.target?.id === "searchRecipe") {
    state.searchComposing = true;
  }
});

view.addEventListener("compositionend", (event) => {
  if (event.target?.id === "searchRecipe") {
    state.searchComposing = false;
    state.search = event.target.value;
    renderRecipes();
  }
});

view.addEventListener("change", (event) => {
  if (event.target.matches("[data-plan-index]")) {
    const day = state.weekPlan[Number(event.target.dataset.planIndex)];
    day[event.target.dataset.meal] = event.target.value;
    renderPlan();
    void saveApp({ syncCloud: false });
  }
  if (event.target.matches("[data-shopping]")) {
    const name = event.target.dataset.shopping;
    if (event.target.checked) state.purchased.add(name);
    else state.purchased.delete(name);
    renderPlan();
    void saveApp({ syncCloud: false });
  }
});

sheet.addEventListener("click", async (event) => {
  if (event.target === sheet) closeSheet();
  const tagButton = event.target.closest("[data-form-tag]");
  if (tagButton) {
    tagButton.classList.toggle("active");
    tagButton.setAttribute("aria-pressed", String(tagButton.classList.contains("active")));
  }
  const addToTodayPlanButton = event.target.closest("[data-action='addToTodayPlan']");
  if (addToTodayPlanButton) {
    void addRecipeToTodayPlan(addToTodayPlanButton.dataset.id);
    return;
  }
  const cancelCropButton = event.target.closest("[data-action='cancelCrop']");
  if (cancelCropButton) {
    const draft = imageCropState?.draft || null;
    const recipe = imageCropState?.recipeId ? recipeById(imageCropState.recipeId) : null;
    imageCropState = null;
    openRecipeSheet(recipe, draft);
    return;
  }
  const applyCropButton = event.target.closest("[data-action='applyCrop']");
  if (applyCropButton && imageCropState) {
    const image = sheet.querySelector("[data-crop-image]");
    const draft = imageCropState.draft || {};
    const recipe = imageCropState.recipeId ? recipeById(imageCropState.recipeId) : null;
    if (image && image.complete && image.naturalWidth && image.naturalHeight) {
      applyCropButton.disabled = true;
      applyCropButton.textContent = "正在压缩...";
      try {
        const cropped = await cropImageToSquare(image, imageCropState);
        imageCropState = null;
        openRecipeSheet(recipe, { ...draft, image: cropped });
      } catch {
        applyCropButton.disabled = false;
        applyCropButton.textContent = "使用裁剪";
        showToast("图片处理失败，请重新选择");
      }
    }
    return;
  }
  const deleteRecipeButton = event.target.closest("[data-action='deleteRecipe']");
  if (deleteRecipeButton && state.editingRecipeId) {
    const deleteId = state.editingRecipeId;
    const target = recipeById(deleteId);
    if (!target) return;
    deletedRecipeIds.add(deleteId);
    recipes = recipes.filter((recipe) => recipe.id !== deleteId);
    state.cooked = state.cooked.filter((entry) => entry.recipeId !== deleteId);
    state.weekPlan = state.weekPlan.map((day) => ({
      ...day,
      meal: day.meal === deleteId ? "" : day.meal,
    }));
    if (state.detailId === deleteId) state.detailId = null;
    state.editingRecipeId = null;
    void saveApp({ syncCloud: true, sharedChanged: true });
    closeSheet();
    render();
    showToast(`已删除菜谱：${target.name}`);
    return;
  }
  const deleteStockButton = event.target.closest("[data-action='deleteStock']");
  if (deleteStockButton && state.editingStockId) {
    state.stock = state.stock.filter((item) => item.id !== state.editingStockId);
    void saveApp({ syncCloud: true, sharedChanged: true });
    closeSheet();
    render();
  }
});

sheet.addEventListener("change", async (event) => {
  if (!event.target.matches("[data-image-input]")) return;
  const file = event.target.files?.[0];
  const form = event.target.closest("form");
  const draft = form ? getRecipeFormDraft(form) : null;
  const recipe = state.editingRecipeId ? recipeById(state.editingRecipeId) : null;
  if (!file || !draft) return;
  const dataUrl = await fileToDataUrl(file);
  openImageCropSheet(dataUrl, draft, recipe?.id ?? null);
  event.target.value = "";
});

sheet.addEventListener("input", (event) => {
  if (!imageCropState) return;
  if (event.target.matches("[data-crop-zoom]")) {
    const nextZoom = Number(event.target.value);
    const previousScale = imageCropState.baseScale * imageCropState.zoom;
    const centerX = (imageCropState.frameSize / 2 - imageCropState.offsetX) / previousScale;
    const centerY = (imageCropState.frameSize / 2 - imageCropState.offsetY) / previousScale;
    imageCropState.zoom = nextZoom;
    const nextScale = imageCropState.baseScale * imageCropState.zoom;
    imageCropState.offsetX = imageCropState.frameSize / 2 - centerX * nextScale;
    imageCropState.offsetY = imageCropState.frameSize / 2 - centerY * nextScale;
    syncCropPreview();
  }
});

sheet.addEventListener("pointerdown", (event) => {
  if (!imageCropState) return;
  const stage = event.target.closest("[data-crop-stage]");
  if (!stage) return;
  stage.setPointerCapture(event.pointerId);
  imageCropState.dragging = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startOffsetX: imageCropState.offsetX,
    startOffsetY: imageCropState.offsetY,
  };
});

sheet.addEventListener("pointermove", (event) => {
  if (!imageCropState?.dragging || event.pointerId !== imageCropState.dragging.pointerId) return;
  const dx = event.clientX - imageCropState.dragging.startX;
  const dy = event.clientY - imageCropState.dragging.startY;
  imageCropState.offsetX = imageCropState.dragging.startOffsetX + dx;
  imageCropState.offsetY = imageCropState.dragging.startOffsetY + dy;
  syncCropPreview();
});

sheet.addEventListener("pointerup", (event) => {
  if (!imageCropState?.dragging || event.pointerId !== imageCropState.dragging.pointerId) return;
  imageCropState.dragging = null;
});

sheet.addEventListener("pointercancel", () => {
  if (imageCropState) imageCropState.dragging = null;
});

sheet.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.target.id === "recipeForm") {
    const isEditingRecipe = Boolean(state.editingRecipeId);
    const saveButton = event.submitter || event.target.querySelector('button[type="submit"]');
    setRecipeSaveLoading(saveButton);
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
    const tags = Array.from(sheet.querySelectorAll("[data-form-tag].active")).map((button) => button.dataset.formTag);
    const imageFile = form.get("image");
    const existingImage = event.target.dataset.currentImage || (state.editingRecipeId ? recipeImageSrc(recipeById(state.editingRecipeId)) : "");
    const image = imageFile instanceof File && imageFile.size > 0 ? await fileToDataUrl(imageFile) : existingImage;
    const payload = {
      name,
      tag: tags[0] || "",
      tags,
      favorite: state.editingRecipeId ? Boolean(recipeById(state.editingRecipeId)?.favorite) : false,
      ingredients,
      steps,
    };
    if (image) payload.image = image;
    if (state.editingRecipeId) {
      const target = recipeById(state.editingRecipeId);
      if (target) Object.assign(target, payload);
    } else {
      const recipeId = `custom-${Date.now()}`;
      deletedRecipeIds.delete(recipeId);
      recipes.unshift({
        id: recipeId,
        ...payload,
      });
      state.tab = "today";
      document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === "today"));
    }
    const cloudOk = await saveApp({ syncCloud: true, sharedChanged: true });
    closeSheet();
    render();
    if (cloudOk.ok) {
      showRecipeSaveSuccess(isEditingRecipe ? "菜谱已更新" : "恭喜你又添加一道菜！");
    } else {
      showToast(`已保存到本地，云端未同步：${cloudOk.error}`);
    }
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
    const cloudOk = await saveApp({ syncCloud: true, sharedChanged: true });
    closeSheet();
    render();
    showToast(cloudOk.ok ? "库存已保存" : `库存已保存到本地，云端未同步：${cloudOk.error}`);
  }
});

void hydrateApp().then(() => {
  render();
});

registerPwa();
