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
