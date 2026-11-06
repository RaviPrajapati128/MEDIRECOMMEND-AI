const API_URL = "https://medirecommend-ai.onrender.com";
const TOP_K = 3;


const COMMON = [
  { label: "Fever", keys: ["high_fever", "mild_fever"] },
  { label: "Cough", keys: ["cough"] },
  { label: "Headache", keys: ["headache"] },
  { label: "Fatigue", keys: ["fatigue"] },
  { label: "Nausea", keys: ["nausea"] },
  { label: "Vomiting", keys: ["vomiting"] },
  { label: "Sore throat", keys: ["throat_irritation"] },
  { label: "Skin rash", keys: ["skin_rash"] },
];

const $ = (id) => document.getElementById(id);

const ICON_X =
  '<svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8"/></svg>';
const ICON_CHECK =
  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7"/></svg>';

const state = {
  allSymptoms: [],
  selected: new Set(),
  data: null, 
  careIndex: 0,
};

const pretty = (s) => {
  const t = s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const cleanName = (s) => s.replace(/\s+/g, " ").trim();

const VIEWS = ["home", "prediction", "care"];

function showView() {
  const wanted = location.hash.replace("#", "");
  const view = VIEWS.includes(wanted) ? wanted : "home";
  document.querySelectorAll(".view").forEach((el) => {
    el.hidden = el.dataset.view !== view;
  });
  document.querySelectorAll(".tabs a").forEach((a) => {
    if (a.dataset.view === view) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", showView);

function goTo(view) {
  if (location.hash === "#" + view) showView();
  else location.hash = view;
}


function showStatus(message, type) {
  const el = $("status");
  if (!message) {
    el.hidden = true;
    return;
  }
  el.textContent = message;
  el.className = "status " + type;
  el.hidden = false;
}

async function loadSymptoms() {
  showStatus("Loading symptoms...", "info");
  try {
    const res = await fetch(`${API_URL}/symptoms`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    state.allSymptoms = (await res.json()).symptoms;
    buildChips();
    renderOptions();
    showStatus("");
  } catch (err) {
    showStatus(
      `Could not reach the API at ${API_URL}. Start the backend with "uvicorn app:app --reload", then reload this page.`,
      "error"
    );
  }
}

function buildChips() {
  const wrap = $("common");
  wrap.innerHTML = "";
  COMMON.forEach((c) => {
    const key = c.keys.find((k) => state.allSymptoms.includes(k));
    if (!key) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.dataset.symptom = key;
    btn.textContent = c.label;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => toggle(key));
    wrap.appendChild(btn);
  });
}

const input = $("comboInput");
const list = $("comboList");
let activeIndex = -1;
let visible = [];

function openList(open) {
  list.hidden = !open;
  input.setAttribute("aria-expanded", String(open));
  if (!open) activeIndex = -1;
}

function renderOptions() {
  const q = input.value.trim().toLowerCase().replace(/_/g, " ");
  const scroll = list.scrollTop;
  visible = state.allSymptoms.filter((s) => pretty(s).toLowerCase().includes(q));
  list.innerHTML = "";

  if (!visible.length) {
    const li = document.createElement("li");
    li.className = "none";
    li.textContent = "No symptom matches your search";
    list.appendChild(li);
    return;
  }

  visible.forEach((s, i) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(state.selected.has(s)));
    if (i === activeIndex) li.classList.add("active");
    li.innerHTML = `<span></span>${state.selected.has(s) ? ICON_CHECK : ""}`;
    li.firstChild.textContent = pretty(s);
    li.addEventListener("mousedown", (e) => e.preventDefault()); // keep input focus
    li.addEventListener("click", () => toggle(s));
    list.appendChild(li);
  });
  list.scrollTop = scroll;
}

input.addEventListener("focus", () => { renderOptions(); openList(true); });
input.addEventListener("click", () => { renderOptions(); openList(true); });
input.addEventListener("input", () => { activeIndex = -1; renderOptions(); openList(true); });
$("comboBtn").addEventListener("click", () => {
  if (list.hidden) { input.focus(); } else { openList(false); }
});
document.addEventListener("click", (e) => {
  if (!$("combo").contains(e.target)) openList(false);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (list.hidden) { renderOptions(); openList(true); }
    if (!visible.length) return;
    const step = e.key === "ArrowDown" ? 1 : -1;
    activeIndex = (activeIndex + step + visible.length) % visible.length;
    renderOptions();
    const el = list.children[activeIndex];
    if (el) el.scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    if (!list.hidden && visible[activeIndex]) {
      e.preventDefault();
      toggle(visible[activeIndex]);
    }
  } else if (e.key === "Escape") {
    openList(false);
  }
});


function toggle(symptom) {
  if (state.selected.has(symptom)) state.selected.delete(symptom);
  else state.selected.add(symptom);
  renderSelection();
}

function renderSelection() {
  document.querySelectorAll("#common .chip").forEach((chip) => {
    chip.setAttribute("aria-pressed", String(state.selected.has(chip.dataset.symptom)));
  });
  if (!list.hidden) renderOptions();

  const box = $("selected");
  box.innerHTML = "";
  if (!state.selected.size) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Nothing selected yet";
    box.appendChild(p);
  } else {
    [...state.selected].forEach((s) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      const name = document.createElement("span");
      name.textContent = pretty(s);
      const x = document.createElement("button");
      x.type = "button";
      x.setAttribute("aria-label", `Remove ${pretty(s)}`);
      x.innerHTML = ICON_X;
      x.addEventListener("click", () => toggle(s));
      tag.append(name, x);
      box.appendChild(tag);
    });
  }

  $("count").textContent = state.selected.size;
  $("clear").disabled = !state.selected.size;
  $("predict").disabled = !state.selected.size;
}

$("clear").addEventListener("click", () => {
  state.selected.clear();
  renderSelection();
  showStatus("");
});

$("predict").addEventListener("click", async () => {
  const btn = $("predict");
  const label = $("predictText");
  btn.disabled = true;
  label.textContent = "Finding match...";
  showStatus("");

  try {
    const res = await fetch(`${API_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symptoms: [...state.selected], top_k: TOP_K }),
    });

    if (!res.ok) {
      let detail = `Server returned ${res.status}`;
      try {
        const body = await res.json();
        if (typeof body.detail === "string") detail = body.detail;
        else if (Array.isArray(body.detail)) detail = body.detail.map((d) => d.msg).join(" ");
      } catch (_) {}
      throw new Error(detail);
    }

    state.data = await res.json();
    state.careIndex = 0;
    renderPrediction();
    renderCare();
    goTo("prediction");
  } catch (err) {
    showStatus(err.message || "Something went wrong. Try again.", "error");
  } finally {
    label.textContent = "Find likely condition";
    btn.disabled = !state.selected.size;
  }
});

function renderPrediction() {
  const d = state.data;
  $("predEmpty").hidden = !!d;
  $("predBody").hidden = !d;
  if (!d) return;

  const used = $("usedTags");
  used.innerHTML = "";
  d.symptoms_used.forEach((s) => {
    const t = document.createElement("span");
    t.className = "tag static";
    t.textContent = pretty(s);
    used.appendChild(t);
  });

  const wrap = $("predList");
  wrap.innerHTML = "";
  d.predictions.forEach((p, i) => {
    const pct = (p.probability * 100).toFixed(1);
    const card = document.createElement("article");
    card.className = "pred" + (i === 0 ? " top" : "");

    const head = document.createElement("div");
    head.className = "pred-head";
    const h2 = document.createElement("h2");
    h2.textContent = cleanName(p.disease);
    if (i === 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Most likely";
      h2.appendChild(badge);
    }
    const pctEl = document.createElement("span");
    pctEl.className = "pct";
    pctEl.textContent = `${pct}% match`;
    head.append(h2, pctEl);

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("span");
    fill.style.width = "0%";
    bar.appendChild(fill);
    requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${pct}%`)));

    const desc = document.createElement("p");
    desc.textContent = p.description;

    const more = document.createElement("button");
    more.type = "button";
    more.className = "btn";
    more.textContent = "See precautions and medication";
    more.addEventListener("click", () => {
      state.careIndex = i;
      renderCare();
      goTo("care");
    });

    card.append(head, bar, desc, more);
    wrap.appendChild(card);
  });

  $("predDisclaimer").textContent = d.disclaimer;
}


function fillList(ul, items, emptyText) {
  ul.innerHTML = "";
  if (!items || !items.length) {
    const li = document.createElement("li");
    li.className = "none";
    li.textContent = emptyText;
    ul.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  });
}

function renderCare() {
  const d = state.data;
  $("careEmpty").hidden = !!d;
  $("careBody").hidden = !d;
  if (!d) return;

  const tabs = $("careTabs");
  tabs.innerHTML = "";
  d.predictions.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(i === state.careIndex));
    b.textContent = cleanName(p.disease);
    b.addEventListener("click", () => {
      state.careIndex = i;
      renderCare();
    });
    tabs.appendChild(b);
  });

  const p = d.predictions[state.careIndex];
  $("careTitle").textContent = cleanName(p.disease);
  fillList($("precList"), p.precautions, "No precautions available.");
  fillList($("medList"), p.medications, "No medication listed.");
  $("careDisclaimer").textContent = d.disclaimer;
}


renderSelection();
renderPrediction();
renderCare();
showView();
loadSymptoms();