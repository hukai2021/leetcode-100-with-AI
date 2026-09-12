'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {SqlRunner} = require('../electron/sql-runner.cjs');

const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''));
const hash = name => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');

test('All SQL50 reference queries pass official examples and independent boundary fixtures', {timeout: 600000}, async t => {
  const problems = read('data/sql-problems.json');
  const fixtures = read('data/sql-cases.json');
  const references = read('scripts/sql-reference-solutions.json');
  assert.equal(problems.length, 50);
  assert.equal(new Set(problems.map(problem => problem.id)).size, 50);
  assert.equal(Object.keys(references).length, 50);
  const runner = new SqlRunner({runtimeRoot: path.join(root, 'runtime'), workRoot: path.join(root, '.local', 'sql-catalog-tests')});
  const detected = await runner.detect();
  assert.equal(detected.available, true, 'Bundled SQLite runtime must be available');
  const report = {startedAt: new Date().toISOString(), status: 'running', dialect: detected.version,
    scope: 'Real local SQLite execution of locally authored reference SQL against cached official public examples and independently expected boundary fixtures. Not LeetCode official judging or hidden tests.',
    hashes: Object.fromEntries(['data/sql-problems.json', 'data/sql-cases.json', 'scripts/sql-reference-solutions.json', 'electron/sql-runner.cjs', 'electron/sql-harness.py'].map(file => [file, hash(file)])),
    records: [], rejectedWrongSolutions: [], failures: []};
  try {
    for (const problem of problems) {
      assert.equal(problem.kind, 'sql', problem.id);
      assert.equal(typeof references[problem.id], 'string', problem.id + ' missing reference');
      assert.ok(fixtures[problem.id]?.length >= 2, problem.id + ' missing official or boundary fixture');
      const result = await runner.run({problem, language: 'sql', code: references[problem.id], cases: fixtures[problem.id], timeoutMs: 3000});
      report.records.push({id: problem.id, title: problem.title, code: references[problem.id], ...result});
      if (result.status !== 'passed') {
        report.failures.push({id: problem.id, status: result.status, error: result.error || result.cases.find(sample => sample.error)?.error || null});
        t.diagnostic('FAIL ' + problem.id + ' ' + result.status + ' ' + result.passed + '/' + result.total);
      }
    }
    const wrongSolutions = {
      'sql-1757': 'SELECT product_id FROM Products;',
      'sql-584': 'SELECT name FROM Customer WHERE referee_id != 2;',
      'sql-1280': 'SELECT s.student_id, s.student_name, sub.subject_name, COUNT(e.subject_name) AS attended_exams FROM Students s CROSS JOIN Subjects sub INNER JOIN Examinations e ON e.student_id = s.student_id AND e.subject_name = sub.subject_name GROUP BY s.student_id, s.student_name, sub.subject_name ORDER BY s.student_id, sub.subject_name;',
      'sql-1517': "SELECT user_id, name, mail FROM Users WHERE mail LIKE '%@leetcode.com';",
      'sql-196': 'DELETE FROM Person;'
    };
    for (const [id, code] of Object.entries(wrongSolutions)) {
      const problem = problems.find(problem => problem.id === id);
      assert.ok(problem, 'Missing representative problem ' + id);
      const result = await runner.run({problem, language: 'sql', code, cases: fixtures[id], timeoutMs: 3000});
      report.rejectedWrongSolutions.push({id, code, rejected: result.status !== 'passed', ...result});
      if (result.status === 'passed') {
        report.failures.push({id, status: 'incorrect_solution_accepted'});
        t.diagnostic('FAIL ' + id + ' incorrect_solution_accepted');
      }
    }
    report.status = report.failures.length ? 'failed' : 'passed';
  } finally {
    report.completedAt = new Date().toISOString();
    report.totalProblems = report.records.length;
    report.passedProblems = report.records.filter(record => record.status === 'passed').length;
    report.totalCases = report.records.reduce((total, record) => total + record.total, 0);
    report.passedCases = report.records.reduce((total, record) => total + record.passed, 0);
    report.rejectedWrongCount = report.rejectedWrongSolutions.filter(record => record.rejected).length;
    const destination = path.join(root, 'docs', 'test-evidence', 'sql-catalog.json');
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n', 'utf8');
    t.diagnostic(JSON.stringify({status: report.status, totalProblems: report.totalProblems, passedProblems: report.passedProblems, totalCases: report.totalCases, passedCases: report.passedCases, rejectedWrongCount: report.rejectedWrongCount, failedIds: report.failures.map(item => item.id), report: 'docs/test-evidence/sql-catalog.json'}));
  }
  assert.equal(report.failures.length, 0, 'SQL50 reference or wrong-solution verification failed; see private evidence report');
  assert.equal(report.records.length, 50);
});
