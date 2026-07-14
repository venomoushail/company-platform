import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCategoryLabel,
  normalizeCategorySlug,
} from "./formatCategoryLabel.ts";

test("formats category labels", () => {
  assert.equal(formatCategoryLabel("employment_basics"), "Employment Basics");
  assert.equal(
    formatCategoryLabel("attendance-and-scheduling"),
    "Attendance and Scheduling"
  );
  assert.equal(
    formatCategoryLabel("  reporting___and--information security  "),
    "Reporting and Information Security"
  );
  assert.equal(
    formatCategoryLabel("Workplace Conduct Compliance"),
    "Workplace Conduct Compliance"
  );
  assert.equal(formatCategoryLabel("PAY_AND_CASH_CONTROLS"), "Pay and Cash Controls");
  assert.equal(formatCategoryLabel("rules_of_the_house"), "Rules of the House");
  assert.equal(formatCategoryLabel(null), "Uncategorized");
  assert.equal(formatCategoryLabel(""), "Uncategorized");
});

test("normalizes AI-generated categories to safe slugs", () => {
  assert.equal(
    normalizeCategorySlug(" Reporting & Information Security "),
    "reporting_and_information_security"
  );
  assert.equal(
    normalizeCategorySlug("Workplace---Conduct / Compliance"),
    "workplace_conduct_compliance"
  );
  assert.equal(normalizeCategorySlug("Café Safety"), "cafe_safety");
  assert.equal(normalizeCategorySlug(null), "");
});
