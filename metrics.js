export const BASELINE_COUNTRIES = [
  { code: "PAK", name: "Pakistan", accent: "#d9ff65" },
  { code: "IND", name: "India", accent: "#69d5ff" },
  { code: "BGD", name: "Bangladesh", accent: "#c6a0ff" },
  { code: "USA", name: "United States", accent: "#ffad6b" },
];

const ACCENTS = ["#d9ff65", "#69d5ff", "#c6a0ff", "#ffad6b", "#ff8c8c", "#7ee7c1"];

export const INDICATORS = {
  "NY.GDP.MKTP.CD": { label: "GDP", shortLabel: "Gross domestic product", unit: "currency", definition: "Current US dollars" },
  "NY.GDP.MKTP.KD.ZG": { label: "GDP growth", shortLabel: "GDP growth", unit: "percent", definition: "Annual percentage change" },
  "SP.POP.TOTL": { label: "Population", shortLabel: "Population", unit: "integer", definition: "Total people" },
  "SL.UEM.TOTL.ZS": { label: "Unemployment", shortLabel: "Unemployment", unit: "percent", definition: "Share of total labour force" },
  "IT.NET.USER.ZS": { label: "Internet access", shortLabel: "Internet use", unit: "percent", definition: "Individuals using the internet" },
};

export function latestObservation(rows) {
  return (rows || []).find((row) => row?.value !== null && row?.value !== undefined) || null;
}

export function formatValue(value, unit) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not reported";
  if (unit === "currency") {
    if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    return `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (unit === "percent") return `${Number(value).toFixed(1)}%`;
  if (unit === "integer") {
    if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    return Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function normalizeBrandColor(value, fallback) {
  const candidate = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toUpperCase() : fallback;
}

export function percentChange(series) {
  const valid = (series || []).filter((point) => point?.value !== null && point?.value !== undefined);
  if (valid.length < 2 || valid[valid.length - 1].value === 0) return null;
  const newest = valid[0].value;
  const oldest = valid[valid.length - 1].value;
  return ((newest - oldest) / Math.abs(oldest)) * 100;
}

export function chronologicalSeries(rows) {
  return (rows || [])
    .filter((row) => row?.value !== null && row?.value !== undefined)
    .map((row) => ({ year: Number(row.date), value: Number(row.value) }))
    .sort((a, b) => a.year - b.year);
}

export function buildWorldBankUrl(countryCodes, indicatorCode) {
  return `https://api.worldbank.org/v2/country/${countryCodes.join(";")}/indicator/${indicatorCode}?format=json&date=2015:2024&per_page=500`;
}

export function buildCountryCatalogueUrl() {
  return "https://api.worldbank.org/v2/country?format=json&per_page=400";
}

export function countryAccent(code) {
  const fixed = BASELINE_COUNTRIES.find((country) => country.code === code)?.accent;
  if (fixed) return fixed;
  const index = [...String(code)].reduce((total, character) => total + character.charCodeAt(0), 0) % ACCENTS.length;
  return ACCENTS[index];
}

const CUSTOM_COLUMN_TO_INDICATOR = {
  gdp: "NY.GDP.MKTP.CD",
  gdp_growth: "NY.GDP.MKTP.KD.ZG",
  population: "SP.POP.TOTL",
  unemployment: "SL.UEM.TOTL.ZS",
  internet_use: "IT.NET.USER.ZS",
};

function parseCsvRow(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("A CSV row has an unfinished quote");
  values.push(value.trim());
  return values;
}

function normaliseColumn(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function customCode(name, codes) {
  const base = String(name).replace(/[^a-z]/gi, "").toUpperCase().slice(0, 3) || "CUS";
  let code = base;
  let suffix = 1;
  while (codes.has(code)) {
    code = `${base}${suffix}`;
    suffix += 1;
  }
  return code;
}

/**
 * Convert a simple user CSV into the same record shape used by the dashboard.
 * Required columns: country, year. Optional code plus one or more metric columns.
 */
export function parseCustomCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("Add a header row and at least one data row");
  const headers = parseCsvRow(lines[0]).map(normaliseColumn);
  const countryIndex = headers.findIndex((header) => ["country", "country_name", "name"].includes(header));
  const yearIndex = headers.indexOf("year");
  const codeIndex = headers.indexOf("code");
  const metricColumns = Object.entries(CUSTOM_COLUMN_TO_INDICATOR)
    .map(([column, indicator]) => ({ index: headers.indexOf(column), indicator }))
    .filter(({ index }) => index >= 0);
  if (countryIndex < 0 || yearIndex < 0) throw new Error("Your CSV needs country and year columns");
  if (!metricColumns.length) throw new Error("Add at least one metric column, such as gdp or population");

  const records = new Map(Object.keys(INDICATORS).map((code) => [code, []]));
  const countries = [];
  const countryCodes = new Map();
  const usedCodes = new Set();
  let validRows = 0;

  lines.slice(1).forEach((line, rowOffset) => {
    const values = parseCsvRow(line);
    const name = String(values[countryIndex] || "").trim();
    const year = Number(values[yearIndex]);
    if (!name && values.every((value) => !value)) return;
    if (!name || !Number.isInteger(year) || year < 1900 || year > 2100) {
      throw new Error(`Check country and year on row ${rowOffset + 2}`);
    }
    let code = countryCodes.get(name.toLowerCase());
    if (!code) {
      const requested = String(values[codeIndex] || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      code = requested && !usedCodes.has(requested) ? requested : customCode(name, usedCodes);
      countryCodes.set(name.toLowerCase(), code);
      usedCodes.add(code);
      countries.push({ code, name, accent: countryAccent(code) });
    }
    let rowHasMetric = false;
    metricColumns.forEach(({ index, indicator }) => {
      const raw = String(values[index] || "").replace(/,/g, "").trim();
      if (!raw) return;
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Metric values must be numbers on row ${rowOffset + 2}`);
      records.get(indicator).push({ countryiso3code: code, country: { value: name }, date: String(year), value });
      rowHasMetric = true;
    });
    if (!rowHasMetric) throw new Error(`Add at least one metric value on row ${rowOffset + 2}`);
    validRows += 1;
  });
  if (!validRows) throw new Error("No usable data rows were found");
  records.forEach((rows) => rows.sort((first, second) => Number(second.date) - Number(first.date)));
  return { countries, records, rowCount: validRows };
}

/**
 * Build a plain, export-ready view of the current dashboard without touching
 * the DOM. Both live World Bank data and custom CSV data use this same shape.
 */
export function createDashboardExport({ country, selectedIndicator, records, countries }) {
  const rowsFor = (indicatorCode, countryCode) => (records.get(indicatorCode) || []).filter((row) => row.countryiso3code === countryCode);
  const kpiCodes = ["NY.GDP.MKTP.CD", "NY.GDP.MKTP.KD.ZG", "SP.POP.TOTL", "IT.NET.USER.ZS"];
  const kpis = kpiCodes.map((code) => {
    const indicator = INDICATORS[code];
    const latest = latestObservation(rowsFor(code, country.code));
    return { indicator: indicator.label, unit: indicator.unit, value: latest?.value ?? null, year: latest?.date ?? null };
  });
  const trendIndicator = INDICATORS[selectedIndicator];
  const comparison = (countries || []).map((item) => {
    const latest = latestObservation(rowsFor("NY.GDP.MKTP.KD.ZG", item.code));
    return { country: item.name, value: latest?.value ?? null, year: latest?.date ?? null };
  }).filter((item) => item.value !== null);
  const signals = Object.entries(INDICATORS).map(([code, indicator]) => {
    const latest = latestObservation(rowsFor(code, country.code));
    return { indicator: indicator.shortLabel, value: latest?.value ?? null, year: latest?.date ?? null, definition: indicator.definition, unit: indicator.unit };
  });
  return {
    country: country.name,
    countryCode: country.code,
    trend: { label: trendIndicator.label, unit: trendIndicator.unit, series: chronologicalSeries(rowsFor(selectedIndicator, country.code)) },
    kpis,
    comparison,
    signals,
  };
}
