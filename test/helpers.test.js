const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractFirstInt,
  isCannotSendDmError,
  limitEmbedValue,
  normalizeYesNo,
  resolveLanguage,
} = require("../src/helpers");

test("uses Ukrainian for Ukrainian and Russian Discord locales", () => {
  assert.equal(resolveLanguage("uk"), "ua");
  assert.equal(resolveLanguage("uk-UA"), "ua");
  assert.equal(resolveLanguage("ru"), "ua");
  assert.equal(resolveLanguage("ru-RU"), "ua");
  assert.equal(resolveLanguage("en-US"), "en");
});

test("normalizes supported yes/no answers", () => {
  assert.equal(normalizeYesNo("Так"), true);
  assert.equal(normalizeYesNo("да"), true);
  assert.equal(normalizeYesNo("Ні"), false);
  assert.equal(normalizeYesNo("нет"), false);
  assert.equal(normalizeYesNo("maybe"), null);
});

test("extracts the first rank number", () => {
  assert.equal(extractFirstInt("TOP 10"), 10);
  assert.equal(extractFirstInt("rank 11 or 12"), 11);
  assert.equal(extractFirstInt("none"), null);
});

test("keeps embed values within Discord's limit", () => {
  assert.equal(limitEmbedValue("answer"), "answer");
  assert.equal(limitEmbedValue(""), "N/A");
  assert.equal(limitEmbedValue("x".repeat(2000)).length, 1024);
});

test("recognizes Discord DM errors", () => {
  assert.equal(isCannotSendDmError({ code: 50007 }), true);
  assert.equal(
    isCannotSendDmError({ message: "Cannot send messages to this user due to having no mutual guilds" }),
    true
  );
  assert.equal(isCannotSendDmError({ message: "Network error" }), false);
});
