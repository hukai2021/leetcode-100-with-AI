'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''));
const hash = name => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');

// Catalog declarations preserve the official schema without rewriting older SQLite drafts.
test('MySQL SQL 50 metadata preserves official types and the existing SQLite content', () => {
  const problems = read('data/sql-problems.json');
  const mysqlReferences = read('scripts/mysql-reference-solutions.json');
  const sqliteReferences = read('scripts/sql-reference-solutions.json');
  assert.equal(problems.length, 50);
  assert.equal(Object.keys(mysqlReferences).length, 50);
  assert.deepEqual(Object.keys(mysqlReferences).sort(), Object.keys(sqliteReferences).sort());
  for (const problem of problems) {
    const official = read('data/sql-official-cache/' + problem.displayId + '.json');
    const schema = JSON.parse(official.metaData).database_schema;
    const expected = Object.entries(schema).map(([name, columns]) => ({name, columns: Object.entries(columns).map(([name, type]) => ({name, type}))}));
    assert.deepEqual(problem.sql.mysqlTables, expected, problem.id + ' official schema');
    assert.deepEqual(problem.sql.mysqlTables.map(table => [table.name, table.columns.map(column => column.name)]),
      problem.sql.tables.map(table => [table.name, table.columns.map(column => column.name)]), problem.id + ' fixture shape');
    assert.equal(problem.sql.dialect, 'sqlite', problem.id + ' existing dialect metadata');
    assert.equal(problem.contentByDialect.sqlite, problem.content, problem.id + ' existing Chinese content');
    assert.match(problem.contentByDialect.mysql, /本地使用 MySQL 8/);
    assert.doesNotMatch(problem.contentByDialect.mysql, /本地使用 SQLite|本地类型|不支持 MySQL|SQLite 不内建/);
    assert.match(problem.templates.sql, /SQLite/);
    assert.match(problem.templates.mysql, /MySQL/);
    assert.equal(typeof mysqlReferences[problem.id], 'string');
    assert.ok(mysqlReferences[problem.id].trim().length > 10);
  }
});

test('All SQL 50 MySQL queries pass the unchanged official examples and independent boundary fixtures', {timeout: 600000}, async t => {
  const {MysqlRunner} = require('../electron/mysql-runner.cjs');
  const problems = read('data/sql-problems.json');
  const fixtures = read('data/sql-cases.json');
  const references = read('scripts/mysql-reference-solutions.json');
  const runner = new MysqlRunner({runtimeRoot: path.join(root, 'runtime'), workRoot: path.join(root, '.local', 'mysql-catalog-tests-' + Date.now())});
  const report = {
    startedAt: new Date().toISOString(), status: 'running', dialect: null,
    scope: 'Real local MySQL execution of locally authored reference SQL against unchanged cached official public examples and independently expected boundary fixtures. Not LeetCode official judging or hidden tests.',
    hashes: Object.fromEntries(['data/sql-problems.json', 'data/sql-cases.json', 'scripts/mysql-reference-solutions.json', 'electron/mysql-runner.cjs'].map(file => [file, hash(file)])),
    records: [], rejectedWrongSolutions: [], failures: []
  };
  try {
    const detected = await runner.detect();
    assert.equal(detected.available, true, 'Bundled real MySQL runtime must be available');
    report.dialect = detected.version;
    for (const problem of problems) {
      assert.equal(problem.kind, 'sql');
      assert.ok(fixtures[problem.id]?.length >= 2);
      const result = await runner.run({problem, language: 'sql', sqlDialect: 'mysql', code: references[problem.id], cases: fixtures[problem.id], timeoutMs: 3000});
      report.records.push({id: problem.id, title: problem.title, code: references[problem.id], ...result});
      if (result.status !== 'passed') {
        report.failures.push({id: problem.id, status: result.status, error: result.error || result.cases.find(sample => sample.error)?.error || null});
        t.diagnostic('FAIL ' + problem.id + ' ' + result.status + ' ' + result.passed + '/' + result.total);
      }
    }
    const wrongSolutions = {
      'sql-1757': "SELECT product_id FROM Products WHERE low_fats='Y' OR recyclable='Y';",
      'sql-584': 'SELECT name FROM Customer WHERE referee_id != 2;',
      'sql-1280': 'SELECT s.student_id, s.student_name, sub.subject_name, COUNT(e.subject_name) AS attended_exams FROM Students s CROSS JOIN Subjects sub INNER JOIN Examinations e ON e.student_id = s.student_id AND e.subject_name = sub.subject_name GROUP BY s.student_id, s.student_name, sub.subject_name ORDER BY s.student_id, sub.subject_name;',
      'sql-197': 'SELECT w.id FROM Weather w JOIN Weather p ON DATEDIFF(w.recordDate,p.recordDate)<=1 WHERE w.temperature>p.temperature;',
      'sql-1517': "SELECT user_id,name,mail FROM Users WHERE REGEXP_LIKE(mail,'^[A-Za-z][A-Za-z0-9_.-]*@leetcode[.]com$','i');",
      'sql-1484': "SELECT sell_date,COUNT(product) AS num_sold,GROUP_CONCAT(product ORDER BY product SEPARATOR ',') AS products FROM Activities GROUP BY sell_date ORDER BY sell_date;",
      'sql-196': 'DELETE FROM Person;'
    };
    for (const [id, code] of Object.entries(wrongSolutions)) {
      const problem = problems.find(problem => problem.id === id);
      const result = await runner.run({problem, language: 'sql', sqlDialect: 'mysql', code, cases: fixtures[id], timeoutMs: 3000});
      report.rejectedWrongSolutions.push({id, code, rejected: result.status !== 'passed', ...result});
      if (result.status === 'passed') {
        report.failures.push({id, status: 'incorrect_solution_accepted'});
        t.diagnostic('FAIL ' + id + ' incorrect_solution_accepted');
      }
    }
    report.status = report.failures.length ? 'failed' : 'passed';
  } finally {
    await runner.close?.();
    report.completedAt = new Date().toISOString();
    report.totalProblems = report.records.length;
    report.passedProblems = report.records.filter(record => record.status === 'passed').length;
    report.totalCases = report.records.reduce((total, record) => total + record.total, 0);
    report.passedCases = report.records.reduce((total, record) => total + record.passed, 0);
    report.rejectedWrongCount = report.rejectedWrongSolutions.filter(record => record.rejected).length;
    const destination = path.join(root, 'docs', 'test-evidence', 'mysql-catalog.json');
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n', 'utf8');
    t.diagnostic(JSON.stringify({status: report.status, totalProblems: report.totalProblems, passedProblems: report.passedProblems,
      totalCases: report.totalCases, passedCases: report.passedCases, rejectedWrongCount: report.rejectedWrongCount,
      failedIds: report.failures.map(item => item.id), report: 'docs/test-evidence/mysql-catalog.json'}));
  }
  assert.equal(report.failures.length, 0, 'MySQL SQL 50 verification failed; see private evidence report');
  assert.equal(report.records.length, 50);
  assert.equal(report.totalCases, 103);
});


test('SQL 50 DELETE starts fresh after an earlier wrong deletion', {timeout: 120000}, async () => {
  const {MysqlRunner} = require('../electron/mysql-runner.cjs');
  const problem = read('data/sql-problems.json').find(problem => problem.id === 'sql-196');
  const fixtures = read('data/sql-cases.json')['sql-196'];
  const code = read('scripts/mysql-reference-solutions.json')['sql-196'];
  const runner = new MysqlRunner({runtimeRoot: path.join(root, 'runtime'), workRoot: path.join(root, '.local', 'mysql-delete-isolation-' + Date.now())});
  const report = {startedAt: new Date().toISOString(), passed: false};
  try {
    const wrong = await runner.run({problem, language: 'sql', code: 'DELETE FROM Person;', cases: [fixtures[0]]});
    assert.equal(wrong.status, 'failed');
    assert.equal(wrong.cases[0].error, null);
    assert.deepEqual(wrong.cases[0].actual.rows, []);
    const restored = await runner.run({problem, language: 'sql', code, cases: fixtures});
    assert.equal(restored.status, 'passed', JSON.stringify(restored));
    assert.equal(restored.passed, 2);
    const repeated = await runner.run({problem, language: 'sql', code, cases: [fixtures[0]]});
    assert.equal(repeated.status, 'passed', JSON.stringify(repeated));
    report.wrongDeleteReturnedEmptyRows = true;
    report.restoredReferencePassedCases = restored.passed;
    report.repeatedReferencePassedCases = repeated.passed;
    report.runtime = restored.runtime;
    report.passed = true;
  } finally {
    await runner.close();
    report.completedAt = new Date().toISOString();
    const destination = path.join(root, 'docs', 'test-evidence', 'mysql-delete-isolation.json');
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  }
});
