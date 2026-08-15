import { COUNTRIES, INDICATORS, buildWorldBankUrl, chronologicalSeries, formatValue, latestObservation, percentChange } from "./metrics.js";

const state = {
  selectedCountry: "PAK",
  selectedIndicator: "NY.GDP.MKTP.CD",
  records: new Map(),
};

const countrySelect = document.querySelector("#country-select");
const indicatorSelect = document.querySelector("#indicator-select");
const refreshButton = document.querySelector("#refresh-button");
const retryButton = document.querySelector("#retry-button");

function populateControls() {
  countrySelect.innerHTML = COUNTRIES.map((country) => `<option value="${country.code}">${country.name}</option>`).join("");
  indicatorSelect.innerHTML = Object.entries(INDICATORS)
    .map(([code, indicator]) => `<option value="${code}">${indicator.label}</option>`)
    .join("");
  countrySelect.value = state.selectedCountry;
  indicatorSelect.value = state.selectedIndicator;
}

async function fetchIndicator(indicatorCode) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(buildWorldBankUrl(COUNTRIES.map((country) => country.code), indicatorCode));
      if (!response.ok) throw new Error(`World Bank API returned ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload) || !Array.isArray(payload[1])) throw new Error("World Bank API returned no observations");
      return payload[1];
    } catch (error) {
      lastError = error;
      if (attempt === 1) await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

async function loadData() {
  setLoading(true);
  setError(false);
  try {
    const entries = [];
    for (const code of Object.keys(INDICATORS)) {
      entries.push([code, await fetchIndicator(code)]);
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    state.records = new Map(entries);
    render();
    setStatus("Live public data", "live");
  } catch (error) {
    console.error("InsightBoard data load failed", error);
    setError(true);
    setStatus("Connection unavailable", "error");
  } finally {
    setLoading(false);
  }
}

function rowsFor(indicatorCode, countryCode) {
  return (state.records.get(indicatorCode) || []).filter((row) => row.countryiso3code === countryCode);
}

function selectedCountry() {
  return COUNTRIES.find((country) => country.code === state.selectedCountry);
}

function render() {
  const country = selectedCountry();
  document.querySelector("#selected-market-label").textContent = country.name;
  document.querySelector("#chart-country-label").textContent = country.name;
  renderKpis(country);
  renderTrend(country);
  renderBenchmark();
  renderSignals(country);
}

function renderKpis(country) {
  const kpiCodes = ["NY.GDP.MKTP.CD", "NY.GDP.MKTP.KD.ZG", "SP.POP.TOTL", "IT.NET.USER.ZS"];
  const cards = kpiCodes.map((code) => {
    const indicator = INDICATORS[code];
    const rows = rowsFor(code, country.code);
    const latest = latestObservation(rows);
    const trend = percentChange(rows);
    const trendMarkup = trend === null ? "Latest observation" : `<span class="delta ${trend >= 0 ? "positive" : "negative"}">${trend >= 0 ? "↑" : "↓"} ${Math.abs(trend).toFixed(1)}% <small>since 2015</small></span>`;
    return `<article class="kpi-card">
      <div class="kpi-top"><span>${indicator.label}</span><span class="kpi-year">${latest?.date || "—"}</span></div>
      <strong>${formatValue(latest?.value, indicator.unit)}</strong>
      ${trendMarkup}
    </article>`;
  });
  document.querySelector("#kpi-grid").innerHTML = cards.join("");
  const years = kpiCodes.map((code) => latestObservation(rowsFor(code, country.code))?.date).filter(Boolean).map(Number);
  document.querySelector("#latest-year").textContent = years.length ? `${Math.max(...years)}` : "—";
}

function renderTrend(country) {
  const indicator = INDICATORS[state.selectedIndicator];
  const series = chronologicalSeries(rowsFor(state.selectedIndicator, country.code));
  document.querySelector("#trend-title").textContent = `${indicator.label} · ${country.name}`;
  document.querySelector("#trend-chart").innerHTML = renderSvgChart(series, country.accent, indicator.unit);
  const change = percentChange(rowsFor(state.selectedIndicator, country.code));
  document.querySelector("#chart-range").textContent = series.length ? `${series[0].year} — ${series[series.length - 1].year} · ${series.length} observations` : "No reported observations";
  document.querySelector("#chart-change").innerHTML = change === null ? "—" : `<span class="${change >= 0 ? "positive" : "negative"}">${change >= 0 ? "↑" : "↓"} ${Math.abs(change).toFixed(1)}% across series</span>`;
}

function renderSvgChart(series, accent, unit) {
  if (!series.length) return `<div class="chart-empty">No reported observations for this selection.</div>`;
  const width = 740;
  const height = 260;
  const pad = { top: 22, right: 20, bottom: 38, left: 56 };
  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const valueSpan = max - min || 1;
  const x = (index) => pad.left + (index / Math.max(series.length - 1, 1)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - (value - min) / valueSpan) * (height - pad.top - pad.bottom);
  const path = series.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(series.length - 1).toFixed(1)},${height - pad.bottom} L ${x(0).toFixed(1)},${height - pad.bottom} Z`;
  const grid = [0, 0.5, 1].map((step) => {
    const value = min + (max - min) * step;
    const yPos = y(value);
    return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${yPos}" y2="${yPos}" class="grid-line"/><text x="0" y="${yPos + 4}" class="axis-label">${formatValue(value, unit)}</text>`;
  }).join("");
  const years = series.map((point, index) => (index === 0 || index === series.length - 1 || index === Math.floor((series.length - 1) / 2) ? `<text x="${x(index)}" y="${height - 10}" text-anchor="middle" class="axis-label">${point.year}</text>` : "")).join("");
  const dots = series.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="3.5" fill="${accent}"><title>${point.year}: ${formatValue(point.value, unit)}</title></circle>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${INDICATORS[state.selectedIndicator].label} trend from ${series[0].year} to ${series[series.length - 1].year}"><defs><linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${accent}" stop-opacity=".22"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#area-fill)"/><path d="${path}" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}${years}</svg>`;
}

function renderBenchmark() {
  const code = "NY.GDP.MKTP.KD.ZG";
  const values = COUNTRIES.map((country) => ({ country, latest: latestObservation(rowsFor(code, country.code)) })).filter(({ latest }) => latest);
  const max = Math.max(...values.map(({ latest }) => Math.max(latest.value, 0)), 1);
  document.querySelector("#benchmark-list").innerHTML = values.map(({ country, latest }) => {
    const width = `${Math.max((Math.max(latest.value, 0) / max) * 100, 2)}%`;
    return `<div class="benchmark-item"><div><span class="country-dot" style="--dot:${country.accent}"></span><strong>${country.name}</strong><small>${latest.date}</small></div><div class="benchmark-bar"><i style="width:${width};background:${country.accent}"></i></div><b>${formatValue(latest.value, "percent")}</b></div>`;
  }).join("") || `<p class="chart-empty">No reported growth values.</p>`;
}

function renderSignals(country) {
  const rows = Object.entries(INDICATORS).map(([code, indicator]) => {
    const latest = latestObservation(rowsFor(code, country.code));
    return `<tr><td><strong>${indicator.shortLabel}</strong></td><td>${formatValue(latest?.value, indicator.unit)}</td><td>${latest?.date || "—"}</td><td>${indicator.definition}</td></tr>`;
  });
  document.querySelector("#signals-table").innerHTML = rows.join("");
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.classList.toggle("spinning", isLoading);
}

function setError(show) {
  document.querySelector("#error-state").hidden = !show;
}

function setStatus(text, kind) {
  const status = document.querySelector("#data-status");
  status.lastChild.textContent = ` ${text}`;
  status.className = `data-status ${kind}`;
}

countrySelect.addEventListener("change", (event) => { state.selectedCountry = event.target.value; render(); });
indicatorSelect.addEventListener("change", (event) => { state.selectedIndicator = event.target.value; render(); });
refreshButton.addEventListener("click", loadData);
retryButton.addEventListener("click", loadData);

populateControls();
loadData();
