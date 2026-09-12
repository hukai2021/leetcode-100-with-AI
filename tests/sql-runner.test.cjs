'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {SqlRunner, compareSql, validateSqlFixture} = require('../electron/sql-runner.cjs');

const runtimeRoot = path.resolve(__dirname, '../runtime');
const workRoot = path.resolve(__dirname, '../.local/tests/sql-runner-' + Date.now());
const problem = {id: 'sql-test', kind: 'sql', sql: {dialect: 'sqlite', orderMatters: false, tables: [
  {name: 'Items', columns: [{name: 'n', type: 'INTEGER'}, {name: 'label', type: 'TEXT'}]}
]}};
const fixture = {input: [{Items: [[1, 'a'], [1, 'a'], [2, null], [3, 'null']]}],
  expected: {columns: ['n', 'label'], rows: [[1, 'a'], [1, 'a'], [2, null], [3, 'null']]}, source: '自建边界测试'};
const makeRunner = () => new SqlRunner({runtimeRoot, workRoot});
const run = (code, options = {}) => makeRunner().run({problem, language: 'sql', code, cases: [fixture], ...options});

test('Bundled Python really provides SQLite', async () => {
  const detected = await makeRunner().detect();
  assert.equal(detected.available, true);
  assert.match(detected.path, /runtime[\\/]python[\\/]python\.exe$/i);
  assert.match(detected.version, /^SQLite \d+\.\d+\.\d+$/);
});

test('Correct SQL returns real rows and wrong answers fail', async () => {
  const correct = await run('SELECT n, label FROM Items');
  assert.equal(correct.status, 'passed', JSON.stringify(correct));
  assert.equal(correct.passed, 1);
  assert.deepEqual(correct.cases[0].actual, fixture.expected);
  assert.equal(correct.language, 'sql');
  assert.equal(correct.limits.memoryMb, 256);
  const wrong = await run('SELECT n, label FROM Items WHERE n > 1');
  assert.equal(wrong.status, 'failed');
  assert.equal(wrong.passed, 0);
});

test('Column aliases must match, ignoring case but preserving column order', async () => {
  assert.equal((await run('SELECT n AS N, label AS LABEL FROM Items')).status, 'passed');
  assert.equal((await run('SELECT n AS wrong_name, label FROM Items')).status, 'failed');
  assert.equal((await run('SELECT label, n FROM Items')).status, 'failed');
});

test('Unordered comparison preserves duplicates and distinguishes NULL from text', async () => {
  assert.equal((await run('SELECT DISTINCT n, label FROM Items')).status, 'failed');
  assert.equal((await run("SELECT n, COALESCE(label, 'null') AS label FROM Items")).status, 'failed');
  assert.equal((await run('SELECT n, label FROM Items ORDER BY n DESC')).status, 'passed');
  const ordered = {...problem, sql: {...problem.sql, orderMatters: true}};
  assert.equal((await run('SELECT n, label FROM Items ORDER BY n DESC', {problem: ordered})).status, 'failed');
  assert.equal((await run('SELECT n, label FROM Items ORDER BY n', {problem: ordered})).status, 'passed');
});

test('CTEs and window functions execute in the actual SQLite engine', async () => {
  const sample = {input: fixture.input, expected: {columns: ['n', 'position'], rows: [[1, 1], [1, 1], [2, 3], [3, 4]]}};
  const result = await run('WITH ranked AS (SELECT n, RANK() OVER (ORDER BY n) AS position FROM Items) SELECT n, position FROM ranked', {cases: [sample]});
  assert.equal(result.status, 'passed', JSON.stringify(result));
});

test('Floating-point tolerance and multiset matching do not discard duplicates', async () => {
  const sample = {input: fixture.input, expected: {columns: ['value'], rows: [[0.3]]}};
  assert.equal((await run('SELECT 0.1 + 0.2 AS value', {cases: [sample]})).status, 'passed');
  assert.equal(compareSql({columns: ['v'], rows: [[1.0000015], [1.000003]]}, {columns: ['v'], rows: [[1.000002], [1.000001]]}), true);
  assert.equal(compareSql({columns: ['v'], rows: [[null], [null]]}, {columns: ['v'], rows: [[null], ['null']]}), false);
});

test('Writes, attached databases, extensions, system tables and multiple statements are rejected', async () => {
  const forbidden = [
    'DROP TABLE Items', 'DELETE FROM Items', "UPDATE Items SET label='changed'",
    "INSERT INTO Items VALUES (9, 'x')", "ATTACH DATABASE ':memory:' AS extra",
    'PRAGMA query_only = OFF', 'SELECT 1; SELECT 2;',
    "SELECT load_extension('anything')", 'SELECT name FROM sqlite_schema',
    "SELECT * FROM pragma_table_info('Items')",
    "WITH chosen AS (SELECT 1) DELETE FROM Items",
    'SELECT 1; DROP TABLE Items'
  ];
  for (const code of forbidden) {
    const result = await run(code);
    assert.equal(result.status, 'failed', code + ': ' + JSON.stringify(result));
    assert.ok(result.cases[0].error, code);
  }
  assert.equal((await run('SELECT n, label FROM Items')).status, 'passed');
});

test('Empty result tables retain column metadata', async () => {
  const sample = {input: [{Items: []}], expected: {columns: ['n', 'label'], rows: []}};
  const result = await run('SELECT n, label FROM Items', {cases: [sample]});
  assert.equal(result.status, 'passed', JSON.stringify(result));
});

test('Schema and row shape validation rejects injected identifiers, types and mismatched tables', () => {
  assert.doesNotThrow(() => validateSqlFixture(problem, [fixture]));
  assert.throws(() => validateSqlFixture({...problem, sql: {...problem.sql, tables: [{name: 'Items; DROP TABLE x', columns: [{name: 'n', type: 'INTEGER'}]}]}}, [fixture]), /表名/);
  assert.throws(() => validateSqlFixture({...problem, sql: {...problem.sql, tables: [{name: 'Items', columns: [{name: 'n', type: 'INTEGER); DROP TABLE x;--'}]}]}}, [fixture]), /列类型/);
  assert.throws(() => validateSqlFixture(problem, [{...fixture, input: [{Other: []}]}]), /表名/);
  assert.throws(() => validateSqlFixture(problem, [{...fixture, input: [{Items: [[1]]}]}]), /列数/);
  assert.throws(() => validateSqlFixture(problem, [{...fixture, input: [{Items: [['1', 'a']]}]}]), /INTEGER/);
  assert.throws(() => validateSqlFixture(problem, [{...fixture, input: [{Items: [[1, 2]]}]}]), /TEXT/);
  assert.throws(() => validateSqlFixture(problem, [{...fixture, expected: {columns: ['n'], rows: [[true]]}}]), /expected.rows/);
});

test('Per-case time limit stops a long recursive query', async () => {
  const began = Date.now();
  const result = await run('WITH RECURSIVE numbers(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM numbers WHERE n < 1000000000) SELECT sum(n) AS n FROM numbers', {timeoutMs: 150});
  assert.equal(result.status, 'failed', JSON.stringify(result));
  assert.match(result.cases[0].error, /超时/);
  assert.ok(Date.now() - began < 4000, 'time limit should return promptly');
});

test('Stop cancels the active child process promptly and a later run still works', async () => {
  const runner = makeRunner();
  await runner.detect();
  const promise = runner.run({problem, language: 'sql',
    code: 'WITH RECURSIVE numbers(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM numbers WHERE n < 1000000000) SELECT sum(n) AS n FROM numbers',
    cases: [fixture], timeoutMs: 30000});
  const deadline = Date.now() + 5000;
  while (!runner.runner.child && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(runner.runner.child);
  const stoppedAt = Date.now();
  runner.stop();
  const result = await promise;
  assert.equal(result.status, 'cancelled', JSON.stringify(result));
  assert.ok(Date.now() - stoppedAt < 3000);
  const next = await runner.run({problem, language: 'sql', code: 'SELECT n, label FROM Items', cases: [fixture]});
  assert.equal(next.status, 'passed', JSON.stringify(next));
});

test('Row and byte limits reject overly large query results', async () => {
  const rows = await run('WITH RECURSIVE numbers(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM numbers WHERE n < 1001) SELECT n FROM numbers');
  assert.match(rows.cases[0].error, /1000 行/);
  const bytes = await run("SELECT printf('%140000s', '') AS n");
  assert.match(bytes.cases[0].error, /128 KiB/);
});

test('DELETE exercise can delete only its target table and starts fresh for each case', async () => {
  const deletion = {id: 'sql-196', kind: 'sql', sql: {dialect: 'sqlite', mode: 'delete', resultTable: 'Person', orderMatters: false, tables: [
    {name: 'Person', columns: [{name: 'id', type: 'INTEGER'}, {name: 'email', type: 'TEXT'}]},
    {name: 'Other', columns: [{name: 'id', type: 'INTEGER'}]}
  ]}};
  const sample = {input: [{Person: [[1, 'a@x'], [2, 'a@x'], [3, 'b@x']], Other: [[1]]}],
    expected: {columns: ['id', 'email'], rows: [[1, 'a@x'], [3, 'b@x']]}};
  const code = 'DELETE FROM Person WHERE id NOT IN (SELECT MIN(id) FROM Person GROUP BY email)';
  const runner = makeRunner();
  const correct = await runner.run({problem: deletion, language: 'sql', code, cases: [sample, sample]});
  assert.equal(correct.status, 'passed', JSON.stringify(correct));
  assert.equal(correct.passed, 2);
  for (const forbidden of ['DELETE FROM Other', "UPDATE Person SET email='x'", 'DELETE FROM Person; SELECT 1;', 'SELECT * FROM Person']) {
    const denied = await runner.run({problem: deletion, language: 'sql', code: forbidden, cases: [sample]});
    assert.equal(denied.status, 'failed', forbidden + ': ' + JSON.stringify(denied));
    assert.ok(denied.cases[0].error);
  }
  const after = await runner.run({problem: deletion, language: 'sql', code, cases: [sample]});
  assert.equal(after.status, 'passed', JSON.stringify(after));
});

test('Syntax errors and unsupported result values are explicit and do not pollute the next case', async () => {
  const syntax = await run('SELECT no_such_column FROM Items');
  assert.match(syntax.cases[0].error, /no such column/);
  const blob = await run("SELECT x'1234' AS n");
  assert.match(blob.cases[0].error, /BLOB/);
  const huge = await run('SELECT 9223372036854775807 AS n');
  assert.match(huge.cases[0].error, /大整数/);
  const valid = await run('/* 中文注释 */ -- 练习\nSELECT n, label FROM Items', {cases: [fixture, fixture]});
  assert.equal(valid.status, 'passed', JSON.stringify(valid));
});


test('Chinese results remain intact across stdout chunks', async () => {
  const text = '中文'.repeat(9000);
  const sample = {input: [{Items: [[1, text]]}], expected: {columns: ['n', 'label'], rows: [[1, text]]}};
  const result = await run('SELECT n, label FROM Items', {cases: [sample]});
  assert.equal(result.status, 'passed', result.cases[0]?.error || result.error);
  assert.equal(result.cases[0].actual.rows[0][1], text);
});

test('DELETE RETURNING is confined to the new memory database and results show remaining rows', async () => {
  const deletion = {...problem, sql: {...problem.sql, mode: 'delete', resultTable: 'Items'}};
  const sample = {...fixture, expected: {columns: ['n', 'label'], rows: [[2, null], [3, 'null']]}};
  const result = await run('DELETE FROM Items WHERE n = 1 RETURNING n, label', {problem: deletion, cases: [sample]});
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.deepEqual(result.cases[0].actual.rows, [[2, null], [3, 'null']]);
  assert.equal((await run('SELECT n, label FROM Items')).status, 'passed');
});

test('SQLite LIKE/GLOB semantics and unavailable REGEXP are explicit', async () => {
  const sample = {input: fixture.input, expected: {columns: ['like_value', 'glob_value'], rows: [[1, 0]]}};
  const result = await run("SELECT 'A' LIKE 'a' AS like_value, 'A' GLOB 'a' AS glob_value", {cases: [sample]});
  assert.equal(result.status, 'passed', JSON.stringify(result));
  const regexp = await run("SELECT 'abc' REGEXP '[a-z]+' AS n");
  assert.match(regexp.cases[0].error, /no such function: REGEXP/i);
});

 test('Stopping between cases prevents remaining case processes from starting', async () => {
  const runner = makeRunner();
  const execute = runner.runner.execute.bind(runner.runner);
  let count = 0;
  runner.runner.execute = async (...args) => {
    const result = await execute(...args);
    count++;
    if (count === 1) runner.stop();
    return result;
  };
  const result = await runner.run({problem, language: 'sql', code: 'SELECT n, label FROM Items', cases: [fixture, fixture, fixture]});
  assert.equal(result.status, 'cancelled', JSON.stringify(result));
  assert.equal(count, 1);
  assert.equal(result.cases.length, 1);
  assert.equal(result.total, 3);
});
