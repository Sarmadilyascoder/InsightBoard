import assert from "node:assert/strict";
import { buildCountryCatalogueUrl, buildWorldBankUrl, chronologicalSeries, countryAccent, formatValue, latestObservation, parseCustomCsv, percentChange } from "../metrics.js";

const sparseRows = [
  { date: "2024", value: null },
  { date: "2023", value: 1500 },
  { date: "2022", value: 1200 },
];

assert.equal(latestObservation(sparseRows).date, "2023", "latest observation ignores unreported values");
assert.equal(formatValue(2_500_000_000_000, "currency"), "$2.50T", "currency formatting handles trillions");
assert.equal(formatValue(243_000_000, "integer"), "243.0M", "integer formatting handles millions");
assert.equal(formatValue(4.321, "percent"), "4.3%", "percent formatting rounds to one decimal");
assert.equal(percentChange(sparseRows), 25, "percent change compares newest reported value with oldest reported value");
assert.deepEqual(chronologicalSeries(sparseRows), [{ year: 2022, value: 1200 }, { year: 2023, value: 1500 }], "chronological series filters nulls and sorts years");
assert.equal(buildWorldBankUrl(["PAK", "IND"], "NY.GDP.MKTP.CD"), "https://api.worldbank.org/v2/country/PAK;IND/indicator/NY.GDP.MKTP.CD?format=json&date=2015:2024&per_page=500", "API helper creates cited live endpoint");
assert.equal(buildCountryCatalogueUrl(), "https://api.worldbank.org/v2/country?format=json&per_page=400", "country catalogue helper returns the full World Bank directory endpoint");
assert.equal(countryAccent("USA"), "#ffad6b", "fixed comparison countries retain stable accent colors");
assert.equal(countryAccent("CAN"), countryAccent("CAN"), "dynamic country colors are deterministic");

const custom = parseCustomCsv("country,code,year,gdp,gdp_growth,population\nSampleland,SMP,2023,100000000000,2.5,1000000\nSampleland,SMP,2024,110000000000,3.1,1050000\n");
assert.equal(custom.countries[0].name, "Sampleland", "custom CSV creates a selectable country");
assert.equal(custom.rowCount, 2, "custom CSV counts usable rows");
assert.equal(latestObservation(custom.records.get("NY.GDP.MKTP.CD")).value, 110000000000, "custom CSV maps GDP into dashboard records");
assert.throws(() => parseCustomCsv("country,year\nSampleland,2024\n"), /metric column/, "custom CSV requires at least one supported metric");

console.log("InsightBoard metrics tests passed.");
