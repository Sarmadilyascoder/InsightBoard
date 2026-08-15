// Version the dependency URL so a browser that cached an older metrics module cannot pair it with this newer application module after a GitHub Pages release.
import { BASELINE_COUNTRIES, INDICATORS, buildCountryCatalogueUrl, buildWorldBankUrl, chronologicalSeries, countryAccent, createDashboardExport, formatValue, latestObservation, normalizeBrandColor, normalizeFooterText, parseCustomCsv, percentChange } from "./metrics.js?v=footer-1";

const state = {
  selectedCountry: "PAK",
  selectedIndicator: "NY.GDP.MKTP.CD",
  countries: [...BASELINE_COUNTRIES],
  records: new Map(),
  requestId: 0,
  mode: "live",
  liveSnapshot: null,
  branding: { logoData: null, logoFormat: null },
};

const countrySearch = document.querySelector("#country-search");
const countryOptions = document.querySelector("#country-options");
const indicatorSelect = document.querySelector("#indicator-select");
const refreshButton = document.querySelector("#refresh-button");
const retryButton = document.querySelector("#retry-button");
const customFile = document.querySelector("#custom-file");
const customFileName = document.querySelector("#custom-file-name");
const sampleDownload = document.querySelector("#sample-download");
const returnLive = document.querySelector("#return-live");
const csvHelp = document.querySelector("#csv-help");
const exportExcelButton = document.querySelector("#export-excel");
const exportPdfButton = document.querySelector("#export-pdf");
const brandingCompany = document.querySelector("#branding-company");
const brandingPrimary = document.querySelector("#branding-primary");
const brandingAccent = document.querySelector("#branding-accent");
const brandingLogo = document.querySelector("#branding-logo");
const brandingLogoName = document.querySelector("#branding-logo-name");
const brandingContact = document.querySelector("#branding-contact");
const brandingFooterNote = document.querySelector("#branding-footer-note");

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));

function countryByCode(code) {
  return state.countries.find((country) => country.code === code) || BASELINE_COUNTRIES.find((country) => country.code === code) || null;
}

function selectedCountry() {
  return countryByCode(state.selectedCountry) || BASELINE_COUNTRIES[0];
}

function comparisonCountries() {
  if (state.mode === "custom") return state.countries;
  const unique = new Map();
  [selectedCountry(), ...BASELINE_COUNTRIES].filter(Boolean).forEach((country) => unique.set(country.code, country));
  return [...unique.values()];
}

function populateControls() {
  countryOptions.innerHTML = state.countries
    .map((country) => `<option value="${escapeHtml(country.name)}" label="${escapeHtml(country.code)}"></option>`)
    .join("");
  countrySearch.value = selectedCountry().name;
  indicatorSelect.innerHTML = Object.entries(INDICATORS)
    .map(([code, indicator]) => `<option value="${code}">${indicator.label}</option>`)
    .join("");
  indicatorSelect.value = state.selectedIndicator;
  document.querySelector("#country-count").textContent = `${state.countries.length} countries available`;
}

function matchCountry(query) {
  const normalized = String(query || "").trim().toLocaleLowerCase();
  if (!normalized) return null;
  return state.countries.find((country) => country.name.toLocaleLowerCase() === normalized || country.code.toLocaleLowerCase() === normalized)
    || state.countries.find((country) => country.name.toLocaleLowerCase().startsWith(normalized))
    || null;
}

function exactCountry(query) {
  const normalized = String(query || "").trim().toLocaleLowerCase();
  if (!normalized) return null;
  return state.countries.find((country) => country.name.toLocaleLowerCase() === normalized || country.code.toLocaleLowerCase() === normalized) || null;
}

async function fetchCountryCatalogue() {
  const response = await fetch(buildCountryCatalogueUrl());
  if (!response.ok) throw new Error(`World Bank country catalogue returned ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) throw new Error("World Bank country catalogue returned no entries");
  const countries = payload[1]
    .filter((entry) => /^[A-Z]{3}$/.test(entry?.id || "") && entry?.region?.id !== "NA" && entry?.name)
    .map((entry) => ({ code: entry.id, name: entry.name, accent: countryAccent(entry.id) }))
    .sort((first, second) => first.name.localeCompare(second.name));
  if (!countries.length) throw new Error("World Bank country catalogue contained no countries");
  return countries;
}

async function fetchIndicator(indicatorCode, countryCodes) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9_000);
    try {
      const response = await fetch(buildWorldBankUrl(countryCodes, indicatorCode), { signal: controller.signal });
      if (!response.ok) throw new Error(`World Bank API returned ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload) || !Array.isArray(payload[1])) throw new Error("World Bank API returned no observations");
      return payload[1];
    } catch (error) {
      lastError = error;
      if (attempt === 1) await new Promise((resolve) => window.setTimeout(resolve, 250));
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function loadData() {
  if (state.mode === "custom") {
    setStatus("Custom CSV preview", "custom");
    return;
  }
  const currentRequest = ++state.requestId;
  const countries = comparisonCountries();
  setLoading(true);
  setError(false);
  try {
    const entries = [];
    const unavailableIndicators = [];
    for (const code of Object.keys(INDICATORS)) {
      try {
        entries.push([code, await fetchIndicator(code, countries.map((country) => country.code))]);
      } catch (error) {
        console.warn(`InsightBoard could not load ${code}`, error);
        unavailableIndicators.push(INDICATORS[code].label);
        entries.push([code, []]);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (currentRequest !== state.requestId) return;
    if (!entries.some(([, rows]) => rows.length)) throw new Error("No World Bank indicators were available");
    state.records = new Map(entries);
    render();
    setStatus(unavailableIndicators.length ? `Live data · ${unavailableIndicators.length} metric delayed` : "Live public data", "live");
  } catch (error) {
    if (currentRequest !== state.requestId) return;
    console.error("InsightBoard data load failed", error);
    setError(true);
    setStatus("Connection unavailable", "error");
  } finally {
    if (currentRequest === state.requestId) setLoading(false);
  }
}

function setCustomMessage(message, isError = false) {
  csvHelp.textContent = message;
  csvHelp.classList.toggle("csv-error", isError);
}

async function loadCustomCsv() {
  const file = customFile.files?.[0];
  if (!file) return;
  if (file.size > 1_000_000) {
    setCustomMessage("Please choose a CSV smaller than 1 MB.", true);
    return;
  }
  try {
    const parsed = parseCustomCsv(await file.text());
    if (state.mode === "live") {
      state.liveSnapshot = { countries: state.countries, selectedCountry: state.selectedCountry, records: state.records };
    }
    state.requestId += 1;
    state.mode = "custom";
    state.countries = parsed.countries;
    state.records = parsed.records;
    state.selectedCountry = parsed.countries[0].code;
    populateControls();
    render();
    setError(false);
    setStatus(`Custom CSV · ${parsed.countries.length} countries · ${parsed.rowCount} rows`, "custom");
    customFileName.textContent = file.name;
    returnLive.hidden = false;
    refreshButton.title = "Return to live World Bank data";
    setDataModeLabel(true);
    setCustomMessage("Custom preview active. Your file stays only in this browser.");
  } catch (error) {
    console.warn("InsightBoard custom CSV rejected", error);
    setCustomMessage(error.message || "This CSV could not be read.", true);
    setStatus("Custom file needs correction", "error");
  }
}

function returnToLiveData() {
  const snapshot = state.liveSnapshot;
  state.mode = "live";
  state.countries = snapshot?.countries || [...BASELINE_COUNTRIES];
  state.selectedCountry = snapshot?.selectedCountry || "PAK";
  state.records = snapshot?.records || new Map();
  state.liveSnapshot = null;
  customFile.value = "";
  customFileName.textContent = "No file selected";
  returnLive.hidden = true;
  refreshButton.title = "Refresh data";
  setDataModeLabel(false);
  setCustomMessage("Required: country, year. Metrics: gdp, gdp_growth, population, unemployment, internet_use.");
  populateControls();
  loadData();
}

function downloadSampleCsv() {
  const sample = "country,code,year,gdp,gdp_growth,population,unemployment,internet_use\nSampleland,SMP,2022,120000000000,3.1,45000000,7.2,72.5\nSampleland,SMP,2023,129000000000,4.0,45800000,6.8,75.1\nSampleland,SMP,2024,138000000000,4.5,46600000,6.2,78.6\nDemo Republic,DMO,2022,86000000000,2.2,31000000,8.1,65.4\nDemo Republic,DMO,2023,89000000000,3.5,31500000,7.8,68.2\nDemo Republic,DMO,2024,95000000000,4.1,32000000,7.1,71.0\n";
  const url = URL.createObjectURL(new Blob([sample], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "insightboard-sample-data.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportSnapshot() {
  return createDashboardExport({ country: selectedCountry(), selectedIndicator: state.selectedIndicator, records: state.records, countries: comparisonCountries() });
}

function exportFileName(extension) {
  const slug = selectedCountry().name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dashboard";
  return `insightboard-${slug}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

function rgbFromHex(color) {
  const normalized = normalizeBrandColor(color, "#0F1B27");
  return [parseInt(normalized.slice(1, 3), 16), parseInt(normalized.slice(3, 5), 16), parseInt(normalized.slice(5, 7), 16)];
}

function currentBranding() {
  const primary = normalizeBrandColor(brandingPrimary.value, "#0F1B27");
  const accent = normalizeBrandColor(brandingAccent.value, "#D9FF65");
  return {
    companyName: (brandingCompany.value.trim() || "InsightBoard").slice(0, 48),
    primary,
    accent,
    primaryRgb: rgbFromHex(primary),
    accentRgb: rgbFromHex(accent),
    logoData: state.branding.logoData,
    logoFormat: state.branding.logoFormat,
    contactDetails: normalizeFooterText(brandingContact.value, 96),
    footerNote: normalizeFooterText(brandingFooterNote.value, 72),
  };
}

async function loadBrandLogo() {
  const file = brandingLogo.files?.[0];
  if (!file) return;
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 1_000_000) {
    brandingLogo.value = "";
    brandingLogoName.textContent = "Use PNG/JPG below 1 MB";
    setStatus("Logo file needs correction", "error");
    return;
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Logo could not be read"));
    reader.readAsDataURL(file);
  });
  state.branding = { logoData: dataUrl, logoFormat: file.type === "image/png" ? "PNG" : "JPEG" };
  brandingLogoName.textContent = file.name;
  setStatus("PDF logo ready", state.mode === "custom" ? "custom" : "live");
}

function setExportBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = busy ? "Preparing…" : label;
}

function exportRows(snapshot) {
  return {
    dashboard: [["InsightBoard dashboard export"], ["Country", snapshot.country], ["Data mode", state.mode === "custom" ? "Private custom CSV" : "World Bank live data"], ["Generated", new Date().toLocaleString()], [], ["KPI", "Value", "Observed year"], ...snapshot.kpis.map((item) => [item.indicator, formatValue(item.value, item.unit), item.year || "Not reported"])],
    trend: [[`${snapshot.trend.label} trend`, snapshot.country], ["Year", "Value"], ...snapshot.trend.series.map((point) => [point.year, point.value])],
    comparison: [["GDP growth comparison", "Latest available"], ["Country", "Value", "Observed year"], ...snapshot.comparison.map((item) => [item.country, item.value, item.year || "Not reported"])],
    signals: [["Latest observed values", snapshot.country], ["Indicator", "Value", "Observed year", "Definition"], ...snapshot.signals.map((item) => [item.indicator, item.value === null ? "Not reported" : item.value, item.year || "Not reported", item.definition])],
  };
}

async function exportExcel() {
  if (!state.records.size) {
    setStatus("Wait for dashboard data", "error");
    return;
  }
  setExportBusy(exportExcelButton, true, "Excel");
  try {
    const module = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
    const XLSX = module.default || module;
    const sheets = exportRows(exportSnapshot());
    const workbook = XLSX.utils.book_new();
    Object.entries(sheets).forEach(([name, rows]) => {
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet["!cols"] = [{ wch: 28 }, { wch: 22 }, { wch: 18 }, { wch: 52 }];
      XLSX.utils.book_append_sheet(workbook, sheet, name[0].toUpperCase() + name.slice(1));
    });
    XLSX.writeFile(workbook, exportFileName("xlsx"), { compression: true });
    setStatus("Excel downloaded", state.mode === "custom" ? "custom" : "live");
  } catch (error) {
    console.error("InsightBoard Excel export failed", error);
    setStatus("Excel export unavailable", "error");
  } finally {
    setExportBusy(exportExcelButton, false, "Excel");
  }
}

async function chartPng(branding) {
  const source = document.querySelector("#trend-chart svg");
  if (!source) return null;
  const copy = source.cloneNode(true);
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.querySelectorAll("path[stroke], circle[fill]").forEach((element) => element.setAttribute(element.tagName === "circle" ? "fill" : "stroke", branding.accent));
  copy.querySelectorAll("linearGradient stop").forEach((stop) => stop.setAttribute("stop-color", branding.accent));
  copy.insertAdjacentHTML("afterbegin", "<style>.grid-line{stroke:#cbddee;stroke-opacity:.35;stroke-dasharray:3 5}.axis-label{fill:#506275;font:9px monospace}</style>");
  const url = URL.createObjectURL(new Blob([copy.outerHTML], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 500;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function addPdfTable(doc, branding, title, headers, rows, y) {
  const left = 12;
  const widths = headers.length === 4 ? [42, 34, 25, 85] : headers.length === 3 ? [75, 48, 57] : [100, 80];
  const drawHeader = () => {
    doc.setFillColor(...branding.primaryRgb);
    doc.rect(left, y, 186, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    let x = left + 2;
    headers.forEach((header, index) => { doc.text(header, x, y + 4.7); x += widths[index]; });
    y += 7;
  };
  doc.setTextColor(20, 32, 45);
  doc.setFontSize(12);
  doc.text(title, left, y);
  y += 6;
  drawHeader();
  rows.forEach((row) => {
    const textRows = row.map((cell, index) => doc.splitTextToSize(String(cell), widths[index] - 4));
    const height = Math.max(7, ...textRows.map((lines) => lines.length * 4 + 3));
    if (y + height > 283) {
      doc.addPage();
      y = 18;
      drawHeader();
    }
    doc.setDrawColor(...branding.accentRgb);
    doc.line(left, y + height, left + 186, y + height);
    doc.setTextColor(35, 49, 62);
    doc.setFontSize(8);
    let x = left + 2;
    textRows.forEach((lines, index) => { doc.text(lines, x, y + 4.5); x += widths[index]; });
    y += height;
  });
  return y + 10;
}

function addPdfFooters(doc, branding) {
  const totalPages = doc.getNumberOfPages();
  const details = [branding.companyName, branding.contactDetails, branding.footerNote].filter(Boolean).join(" · ");
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...branding.accentRgb);
    doc.line(12, 286, 198, 286);
    doc.setTextColor(...branding.primaryRgb);
    doc.setFontSize(7);
    doc.text(details || "InsightBoard report", 12, 291, { maxWidth: 145 });
    doc.text(`Page ${page} of ${totalPages}`, 198, 291, { align: "right" });
  }
}

async function exportPdf() {
  if (!state.records.size) {
    setStatus("Wait for dashboard data", "error");
    return;
  }
  setExportBusy(exportPdfButton, true, "PDF");
  try {
    const module = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm");
    const JsPdf = module.jsPDF || module.default?.jsPDF;
    if (!JsPdf) throw new Error("PDF library unavailable");
    const snapshot = exportSnapshot();
    const branding = currentBranding();
    const doc = new JsPdf({ unit: "mm", format: "a4" });
    doc.setFillColor(...branding.primaryRgb);
    doc.rect(0, 0, 210, 41, "F");
    const headingX = branding.logoData ? 36 : 12;
    if (branding.logoData) doc.addImage(branding.logoData, branding.logoFormat, 12, 10, 18, 18);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text(branding.companyName, headingX, 18);
    doc.setFontSize(13);
    doc.text(`${snapshot.country} dashboard report`, headingX, 26);
    doc.setTextColor(225, 234, 241);
    doc.setFontSize(8);
    doc.text(`Source: ${state.mode === "custom" ? "Private custom CSV in this browser" : "World Bank live data"} · Generated ${new Date().toLocaleString()}`, headingX, 33);
    doc.setFillColor(...branding.accentRgb);
    doc.rect(0, 38, 210, 3, "F");
    snapshot.kpis.forEach((item, index) => {
      const x = 12 + (index % 2) * 94;
      const y = 49 + Math.floor(index / 2) * 23;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(...branding.accentRgb);
      doc.roundedRect(x, y, 87, 18, 2, 2, "FD");
      doc.setTextColor(78, 93, 109);
      doc.setFontSize(7);
      doc.text(item.indicator.toUpperCase(), x + 4, y + 5);
      doc.setTextColor(...branding.primaryRgb);
      doc.setFontSize(13);
      doc.text(formatValue(item.value, item.unit), x + 4, y + 13);
      doc.setTextColor(100, 114, 128);
      doc.setFontSize(7);
      doc.text(item.year || "Not reported", x + 70, y + 13, { align: "right" });
    });
    doc.setTextColor(...branding.primaryRgb);
    doc.setFontSize(12);
    doc.text(`${snapshot.trend.label} trend`, 12, 101);
    const png = await chartPng(branding);
    if (png) doc.addImage(png, "PNG", 12, 106, 186, 66);
    else {
      doc.setFontSize(9);
      doc.text("A chart image was not available; the underlying trend values are included on the next page.", 12, 111);
    }
    doc.addPage();
    doc.setFillColor(...branding.primaryRgb);
    doc.rect(0, 0, 210, 8, "F");
    let y = addPdfTable(doc, branding, "GDP growth comparison", ["Country", "Value", "Observed year"], snapshot.comparison.map((item) => [item.country, formatValue(item.value, "percent"), item.year || "Not reported"]), 18);
    addPdfTable(doc, branding, "Latest observed values", ["Indicator", "Value", "Observed year", "Definition"], snapshot.signals.map((item) => [item.indicator, formatValue(item.value, item.unit), item.year || "Not reported", item.definition]), y);
    doc.addPage();
    doc.setFillColor(...branding.primaryRgb);
    doc.rect(0, 0, 210, 8, "F");
    addPdfTable(doc, branding, `${snapshot.trend.label} trend · ${snapshot.country}`, ["Year", "Value"], snapshot.trend.series.map((point) => [point.year, formatValue(point.value, snapshot.trend.unit)]), 18);
    addPdfFooters(doc, branding);
    doc.save(exportFileName("pdf"));
    setStatus("PDF downloaded", state.mode === "custom" ? "custom" : "live");
  } catch (error) {
    console.error("InsightBoard PDF export failed", error);
    setStatus("PDF export unavailable", "error");
  } finally {
    setExportBusy(exportPdfButton, false, "PDF");
  }
}

function rowsFor(indicatorCode, countryCode) {
  return (state.records.get(indicatorCode) || []).filter((row) => row.countryiso3code === countryCode);
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
    return `<article class="kpi-card"><div class="kpi-top"><span>${indicator.label}</span><span class="kpi-year">${latest?.date || "—"}</span></div><strong>${formatValue(latest?.value, indicator.unit)}</strong>${trendMarkup}</article>`;
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
  const area = `${path} L ${x(series.length - 1).toFixed(1)},${height - pad.bottom} L ${x(0)},${height - pad.bottom} Z`;
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
  const values = comparisonCountries().map((country) => ({ country, latest: latestObservation(rowsFor(code, country.code)) })).filter(({ latest }) => latest);
  const max = Math.max(...values.map(({ latest }) => Math.max(latest.value, 0)), 1);
  document.querySelector("#benchmark-list").innerHTML = values.map(({ country, latest }) => {
    const width = `${Math.max((Math.max(latest.value, 0) / max) * 100, 2)}%`;
    return `<div class="benchmark-item"><div><span class="country-dot" style="--dot:${country.accent}"></span><strong>${escapeHtml(country.name)}</strong><small>${latest.date}</small></div><div class="benchmark-bar"><i style="width:${width};background:${country.accent}"></i></div><b>${formatValue(latest.value, "percent")}</b></div>`;
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

function setDataModeLabel(isCustom) {
  document.querySelector(".live-dot").innerHTML = isCustom ? "<i></i> Custom browser preview" : "<i></i> Live public data";
}

function selectSearchedCountry() {
  const country = matchCountry(countrySearch.value);
  if (!country) {
    countrySearch.value = selectedCountry().name;
    setStatus("Choose a listed country", "error");
    return;
  }
  if (country.code === state.selectedCountry) {
    countrySearch.value = country.name;
    return;
  }
  state.selectedCountry = country.code;
  countrySearch.value = country.name;
  if (state.mode === "custom") render();
  else loadData();
}

countrySearch.addEventListener("change", selectSearchedCountry);
countrySearch.addEventListener("input", () => {
  if (exactCountry(countrySearch.value)) selectSearchedCountry();
});
countrySearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    selectSearchedCountry();
  }
});
countrySearch.addEventListener("blur", () => {
  if (matchCountry(countrySearch.value)) selectSearchedCountry();
  else countrySearch.value = selectedCountry().name;
});
indicatorSelect.addEventListener("change", (event) => { state.selectedIndicator = event.target.value; render(); });
refreshButton.addEventListener("click", () => { if (state.mode === "custom") returnToLiveData(); else loadData(); });
retryButton.addEventListener("click", loadData);
customFile.addEventListener("change", loadCustomCsv);
sampleDownload.addEventListener("click", downloadSampleCsv);
returnLive.addEventListener("click", returnToLiveData);
exportExcelButton.addEventListener("click", exportExcel);
exportPdfButton.addEventListener("click", exportPdf);
brandingLogo.addEventListener("change", loadBrandLogo);

async function initialise() {
  setStatus("Loading country directory", "loading");
  try {
    state.countries = await fetchCountryCatalogue();
  } catch (error) {
    console.warn("InsightBoard country catalogue failed; using baseline countries", error);
  }
  populateControls();
  loadData();
}

initialise();
