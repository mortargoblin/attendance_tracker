// checks the translation files against each other, so a missing key, a
// missing plural form or a renamed placeholder fails the build instead of
// showing up on screen.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { LANGUAGES } from "../js/i18n.js";

const dir = new URL("../locales/", import.meta.url);
const load = (code) => JSON.parse(readFileSync(new URL(`${code}.json`, dir), "utf8"));
const en = load("en");
const codes = Object.keys(LANGUAGES);

/** "{a} of {b}" -> ["a", "b"] for a string or every form of a plural entry */
function placeholders(entry) {
  const texts = typeof entry === "string" ? [entry] : Object.values(entry);
  return [...new Set(texts.flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
}

test("there is a locale file for every language and no extra ones", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  assert.deepEqual(files.sort(), [...codes].sort());
});

for (const code of codes) {
  describe(`locales/${code}.json`, () => {
    const messages = load(code);

    test("has exactly the english keys", () => {
      assert.deepEqual(Object.keys(messages).sort(), Object.keys(en).sort());
    });

    test("no empty strings", () => {
      for (const [key, entry] of Object.entries(messages)) {
        const texts = typeof entry === "string" ? [entry] : Object.values(entry);
        for (const s of texts) assert.ok(s.trim().length > 0, key);
      }
    });

    test("same placeholders as english", () => {
      for (const key of Object.keys(en)) {
        assert.deepEqual(placeholders(messages[key]), placeholders(en[key]), key);
      }
    });

    test("plural entries have every form the language uses", () => {
      const needed = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
      for (const [key, entry] of Object.entries(messages)) {
        if (typeof entry !== "object") continue;
        assert.ok("other" in entry, `${key}: other`);
        for (const form of needed) assert.ok(form in entry, `${key}: ${form}`);
      }
    });
  });
}
