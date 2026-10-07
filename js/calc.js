/** Pure budget math. No DOM, no store access — everything takes data in and returns numbers. */

/** What a line item currently costs: the agreed number once known, otherwise the estimate. */
function itemAmount(item) {
  return Number(item.actual != null && item.actual !== '' ? item.actual : item.estimate) || 0;
}

const isLocked = item => item.status === 'booked';

/**
 * Roll a single category up into locked / flex / total / headroom.
 * `locked` is money already committed. `flex` is everything still moveable — the
 * number that matters when looking for trade-offs.
 */
function categoryRollup(data, categoryId) {
  const items = data.budgetItems.filter(i => i.categoryId === categoryId);
  let locked = 0, flex = 0;
  for (const item of items) {
    if (isLocked(item)) locked += itemAmount(item);
    else flex += itemAmount(item);
  }
  const category = data.categories.find(c => c.id === categoryId);
  const target = Number(category?.budgetTarget) || 0;
  const total = locked + flex;
  return {
    categoryId, category, items,
    locked, flex, total, target,
    headroom: target > 0 ? target - total : null,
    overTarget: target > 0 && total > target,
  };
}

/**
 * Whole-wedding rollup.
 * `overrides` maps categoryId -> replacement total, used by the what-if control so a
 * hypothetical can be priced without mutating any stored data.
 */
function budgetSummary(data, overrides = {}) {
  const rollups = data.categories
    .map(c => {
      const r = categoryRollup(data, c.id);
      if (Object.prototype.hasOwnProperty.call(overrides, c.id)) {
        const proposed = Number(overrides[c.id]) || 0;
        // A what-if can only move flexible money; booked spend stays put.
        return { ...r, flex: Math.max(0, proposed - r.locked), total: Math.max(r.locked, proposed), isOverride: true };
      }
      return r;
    })
    .sort((a, b) => a.category.sortOrder - b.category.sortOrder);

  const locked = rollups.reduce((s, r) => s + r.locked, 0);
  const flex = rollups.reduce((s, r) => s + r.flex, 0);
  const total = locked + flex;
  const target = Number(data.settings.budgetTarget) || 0;
  const guests = Number(data.settings.guestCount) || 0;

  return {
    rollups, locked, flex, total, target,
    remaining: target > 0 ? target - total : null,
    over: target > 0 && total > target,
    overBy: target > 0 ? Math.max(0, total - target) : 0,
    perGuest: guests > 0 ? total / guests : null,
    /** Where the give is: categories with the most still-moveable money, biggest first. */
    flexRanking: rollups.filter(r => r.flex > 0).sort((a, b) => b.flex - a.flex),
    untargetedCount: rollups.filter(r => !r.target && r.total > 0).length,
  };
}

/** Categories carrying no budget items at all — the "have I even thought about this" check. */
function emptyCategories(data) {
  return data.categories.filter(c =>
    !data.budgetItems.some(i => i.categoryId === c.id) &&
    !data.vendorOptions.some(v => v.categoryId === c.id)
  );
}

/** Per-category vendor decision progress. */
function vendorProgress(data) {
  return data.categories
    .map(c => {
      const options = data.vendorOptions.filter(v => v.categoryId === c.id);
      return {
        category: c,
        total: options.length,
        considering: options.filter(v => v.status === 'considering').length,
        shortlisted: options.filter(v => v.status === 'shortlisted').length,
        booked: options.filter(v => v.status === 'booked').length,
        passed: options.filter(v => v.status === 'passed').length,
        isBooked: options.some(v => v.status === 'booked'),
      };
    })
    .sort((a, b) => a.category.sortOrder - b.category.sortOrder);
}

/** Tags a vendor shares with the inspiration board, and how many photos back each one. */
function styleOverlap(vendorTags, tagCounts) {
  const shared = [];
  for (const t of vendorTags || []) {
    const count = tagCounts.get(t);
    if (count) shared.push({ tag: t, count });
  }
  shared.sort((a, b) => b.count - a.count);
  return shared;
}

/** Midpoint of a vendor's price range, used to seed a budget estimate. */
function vendorMidpoint(vendor) {
  const min = Number(vendor.priceMin) || 0;
  const max = Number(vendor.priceMax) || 0;
  if (min && max) return Math.round((min + max) / 2);
  return max || min || 0;
}
