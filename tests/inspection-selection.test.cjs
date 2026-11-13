const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
function load(file) { const filename = path.resolve(file); const m = new Module(filename, module); m.filename = filename; m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, filename); return m.exports; }
const {latestByProject, maintenanceEligible, isPendingInspection} = load('src/lib/inspection-selection.ts');
const {hasFourDigitYear} = load('src/lib/project-form-validation.ts');
test('dates are real calendar dates from 2000 through the four-digit limit', () => {
  for (const value of ['2000-01-01', '2024-02-29', '9999-12-31']) assert.equal(hasFourDigitYear(value), true, value);
  for (const value of ['', '1999-12-31', '2025-02-29', '2026-02-30', '10000-01-01']) assert.equal(hasFourDigitYear(value), false, value);
});
test('one project card uses annual follow-up year and completed results rather than a duplicate pending row', () => {
  const rows = [
    {id:'old',localRoadId:'p',date:'2026-06-10',annualFollowUpYear:2026},
    {id:'pending',localRoadId:'p',date:'2027-06-10',annualFollowUpYear:2027,isScheduledAnnualFollowUp:true},
    {id:'other',localRoadId:'q',date:'2026-01-01'},
  ];
  assert.deepEqual(latestByProject(rows).map(x=>x.id), ['pending','other']);
  rows.push({id:'done',localRoadId:'p',date:'2027-05-11',annualFollowUpYear:2027});
  assert.deepEqual(latestByProject(rows).map(x=>x.id), ['done','other']);
  assert.equal(isPendingInspection(rows[1]), true);
});
test('maintenance eligibility requires a completed result and any component below good', () => {
  const base = { id:'i', localRoadId:'p', date:'2026-01-01' };
  assert.equal(maintenanceEligible({...base, conditionRatings:{A:'Good',B:'Fair'}}), true);
  assert.equal(maintenanceEligible({...base, conditionRatings:{A:'good',B:'poor'}}), true);
  assert.equal(maintenanceEligible({...base, conditionRatings:{A:'Bad'}}), true);
  assert.equal(maintenanceEligible({...base, conditionRatings:{A:'Good',B:'N/A'}}), false);
  assert.equal(maintenanceEligible({...base}), false);
  assert.equal(maintenanceEligible({...base, isScheduledAnnualFollowUp:true, conditionRatings:{A:'Fair'}}), false);
  assert.equal(maintenanceEligible({...base, conditionRating:7}), true);
});

test('required components have remarks and files except N/A; findings summarize only applicable remarks', () => {
  const {assessmentComponents, findingsSummary, validateAssessment} = load('src/lib/inspection-selection.ts');
  const ratings = Object.fromEntries(assessmentComponents.map(label => [label, 'N/A']));
  const remarks = {Concrete:' Cracks   near\n the bridge ', Asphalt:'not applicable'};
  const files = {Concrete:[{name:'photo.jpg'}]};
  assert.equal(validateAssessment(ratings, remarks, files), false);
  ratings.Concrete = 'Fair';
  assert.equal(validateAssessment(ratings, remarks, files), true);
  assert.equal(findingsSummary(ratings, remarks), 'Cracks near the bridge.');
  assert.equal(validateAssessment(ratings, {}, files), false);
  assert.equal(validateAssessment(ratings, remarks, {}), false);
  ratings.Concrete = 'Good';
  assert.equal(validateAssessment(ratings, {}, {}), true);
  ratings.Asphalt = 'Poor';
  assert.equal(validateAssessment(ratings, {}, {}), false);
  ratings.Concrete = 'Fair';
  const long = findingsSummary(ratings, {Concrete:'x'.repeat(300)});
  assert.ok(long.length <= 320);
});

test('findings combine component remarks into one concise summary without category prefixes', () => {
  const {findingsSummary} = load('src/lib/inspection-selection.ts');
  assert.equal(findingsSummary({Concrete:'Good', Drainage:'Fair', Asphalt:'Poor'}, {Concrete:'No cracks.', Drainage:'Water collects at the outlet.', Asphalt:'No cracks.'}), 'No cracks; Water collects at the outlet.');
});

test('a project returns to scheduling only for a newer completed eligible annual follow-up, even after skipped years', () => {
  const {eligibleMaintenanceInspections} = load('src/lib/inspection-selection.ts');
  const first = {id:'first',localRoadId:'p',date:'2027-12-01',annualFollowUpYear:2027,conditionRatings:{A:'Fair'}};
  const pending = {id:'next',localRoadId:'p',date:'2030-01-01',annualFollowUpYear:2030,isScheduledAnnualFollowUp:true};
  assert.deepEqual(eligibleMaintenanceInspections([first],[]).map(x=>x.id), ['first']);
  assert.deepEqual(eligibleMaintenanceInspections([first,pending],['first']), []);
  const sameYear = {...first, id:'duplicate',date:'2027-12-02'};
  assert.deepEqual(eligibleMaintenanceInspections([first,sameYear],['first']), []);
  const later = {...first,id:'later',annualFollowUpYear:2030,date:'2030-01-01'};
  assert.deepEqual(eligibleMaintenanceInspections([first,later],['first']).map(x=>x.id), ['later']);
  assert.deepEqual(eligibleMaintenanceInspections([sameYear],['first'],[first]), []);
  assert.deepEqual(eligibleMaintenanceInspections([later],['first'],[first]).map(x=>x.id), ['later']);
  assert.deepEqual(eligibleMaintenanceInspections([first,later],['first','later']), []);
  assert.deepEqual(eligibleMaintenanceInspections([first,{...later,conditionRatings:{A:'Good'}}],['first']), []);
});

test('calendar month and day minimums use real UTC dates, including leap years and month ends', () => {
  const {addCalendarMonths,addCalendarDays}=load('src/lib/project-form-validation.ts');
  assert.equal(addCalendarMonths('2025-03-31',11),'2026-02-28');
  assert.equal(addCalendarMonths('2023-03-31',11),'2024-02-29');
  assert.equal(addCalendarMonths('2026-01-15',11),'2026-12-15');
  assert.equal(addCalendarDays('2024-02-25',7),'2024-03-03');
  assert.equal(addCalendarDays('2025-12-29',7),'2026-01-05');
  assert.equal(addCalendarMonths('',11),null);
});

test('annual offsets are exact days before the anniversary, every year, clamping month ends', () => {
  const {anniversaryMinusDays, VALIDATION_DAYS_BEFORE, INSPECTION_DAYS_BEFORE} = load('src/lib/project-form-validation.ts');
  assert.equal(VALIDATION_DAYS_BEFORE, 30);
  assert.equal(INSPECTION_DAYS_BEFORE, 29);
  // The worked example from the review sheet: completed 11 Nov 2026, first validation 12 Oct 2027.
  assert.equal(anniversaryMinusDays('2026-11-11', 2027, VALIDATION_DAYS_BEFORE), '2027-10-12');
  assert.equal(anniversaryMinusDays('2026-11-11', 2027, INSPECTION_DAYS_BEFORE), '2027-10-13');
  // Same offsets in later years, not just the first.
  assert.equal(anniversaryMinusDays('2026-11-11', 2029, VALIDATION_DAYS_BEFORE), '2029-10-12');
  // "completion + 11 months" drifted: 31 January gave 31 days, an exact offset gives 30.
  assert.equal(anniversaryMinusDays('2027-01-31', 2028, 30), '2028-01-01');
  // Month ends and leap years clamp instead of rolling into the next month.
  assert.equal(anniversaryMinusDays('2024-02-29', 2025, 30), '2025-01-29');
  assert.equal(anniversaryMinusDays('2026-03-01', 2027, 30), '2027-01-30');
  // Rejects bad input instead of returning a wrong date.
  assert.equal(anniversaryMinusDays('1999-12-31', 2020, 30), null);
  assert.equal(anniversaryMinusDays('2026-11-11', 1990, 30), null);
  assert.equal(anniversaryMinusDays('', 2027, 30), null);
});
