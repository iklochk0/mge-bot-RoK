const test = require("node:test");
const assert = require("node:assert/strict");

const { getSurveyLanguage } = require("./survey-language");

test("uses Ukrainian survey for Ukrainian and Russian Discord locales", () => {
  assert.equal(getSurveyLanguage("uk"), "ua");
  assert.equal(getSurveyLanguage("uk-UA"), "ua");
  assert.equal(getSurveyLanguage("ru"), "ua");
  assert.equal(getSurveyLanguage("ru-RU"), "ua");
});

test("uses English survey for other or missing Discord locales", () => {
  assert.equal(getSurveyLanguage("en-US"), "en");
  assert.equal(getSurveyLanguage("de"), "en");
  assert.equal(getSurveyLanguage(undefined), "en");
});
