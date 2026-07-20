// Logic sanity tests for the pure modules (fsrs.js, storage.js).
// Run from the project root:  node tools/test-core.js
//
// These run the browser modules in Node with minimal window/localStorage
// shims — no DOM needed because these modules are pure logic.

const fs = require('fs');
const path = require('path');

/* ----- Browser shims -------------------------------------------------------- */
const store = {};
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.document = { createElement: () => ({}), body: { appendChild() {}, removeChild() {} } };
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
global.Blob = class {};

function loadModule(rel) {
  const code = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  // eslint-disable-next-line no-eval
  eval(code);
}

loadModule('js/fsrs.js');
loadModule('js/storage.js');

const { FSRS, Storage } = window.App;
const DAY = 24 * 60 * 60 * 1000;
let failures = 0;

function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) failures++;
}

/* ----- FSRS ------------------------------------------------------------------ */
const now = Date.now();

// 1. First review (Good) creates a review-state card due in the future.
let c = Storage.defaultCard();
c = FSRS.applyReview(c, FSRS.RATING.GOOD, now);
check('new card rated Good enters review state', c.state === 'review');
check('due date is in the future (>= 1 day)', c.due >= now + DAY);
check('reps incremented to 1', c.reps === 1);
check('no lapse recorded', c.lapses === 0);

// 2. Again gives a short (10 minute) relearn gap and counts a lapse.
const c2 = FSRS.applyReview(Storage.defaultCard(), FSRS.RATING.AGAIN, now);
check('Again is due again in 10 minutes', c2.due === now + 10 * 60 * 1000);
check('Again counts as a lapse', c2.lapses === 1);

// 3. Successful reviews grow stability; Easy > Good > Hard.
const base = FSRS.applyReview(Storage.defaultCard(), FSRS.RATING.GOOD, now);
const later = now + 3 * DAY;
const sHard = FSRS.applyReview(base, FSRS.RATING.HARD, later).stability;
const sGood = FSRS.applyReview(base, FSRS.RATING.GOOD, later).stability;
const sEasy = FSRS.applyReview(base, FSRS.RATING.EASY, later).stability;
check('stability grows after a successful review', sGood > base.stability);
check('Easy > Good > Hard stability growth', sEasy > sGood && sGood > sHard);

// 4. A lapse never increases stability.
const afterLapse = FSRS.applyReview(base, FSRS.RATING.AGAIN, later);
check('lapse does not grow stability', afterLapse.stability <= base.stability);
check('lapse increments lapses', afterLapse.lapses === base.lapses + 1);

// 5. Difficulty stays within [1, 10] over a long Easy streak.
let d = Storage.defaultCard();
for (let i = 0; i < 30; i++) d = FSRS.applyReview(d, FSRS.RATING.EASY, d.due || now);
check('difficulty stays in [1,10]', d.difficulty >= 1 && d.difficulty <= 10);
check('stability stays positive', d.stability > 0);

// 6. preview() returns labels for all four ratings.
const p = FSRS.preview(base, later);
check('preview covers ratings 1-4', [1, 2, 3, 4].every((r) => p[r] && typeof p[r].label === 'string'));
check('preview labels look like gaps', /^[0-9]+[mhd]$/.test(p[1].label) && /^[0-9]+[mhd]$/.test(p[4].label));

/* ----- Storage ----------------------------------------------------------------- */
const save = Storage.create('Testkind');
check('save created with user name', save.user === 'Testkind');
check('save persisted to localStorage', !!store['anka-save-v1']);

Storage.recordReview(123, c);
check('card state round-trips through storage',
  Storage.getCard(123).stability === c.stability && Storage.getCard(123).state === 'review');
check('unknown card gets default state', Storage.getCard(999).state === 'new');

// Export shape: fresh JSON of the current save must re-import cleanly.
Storage.importSave(JSON.stringify(JSON.parse(store['anka-save-v1'])));
check('exported save re-imports cleanly', Storage.load().user === 'Testkind');

// Import rejects garbage with a friendly error.
let threw = false;
try { Storage.importSave('{"nope": true}'); } catch (e) { threw = true; }
check('invalid import is rejected', threw);

// Import sanitizes broken card entries instead of crashing.
Storage.importSave(JSON.stringify({
  user: 'Imported', cards: { 1: { stability: 'x', reps: -5, state: 'weird' } },
}));
const imported = Storage.getCard(1);
check('import sanitizes card fields',
  imported.stability === 0 && imported.reps === 0 && imported.state === 'new');
check('imported user name applied', Storage.load().user === 'Imported');

// Tag filter preference round-trips; legacy saves without tags default to [].
Storage.setDeselectedTags(['chapter-3', 'noun']);
check('deselected tags persist',
  JSON.stringify(Storage.getDeselectedTags()) === '["chapter-3","noun"]');
Storage.importSave(JSON.stringify({ user: 'Legacy', chapters: [1, 2], cards: {} }));
check('legacy save without tags defaults to all-visible',
  Storage.getDeselectedTags().length === 0);

/* ----- Summary ------------------------------------------------------------------ */
console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
