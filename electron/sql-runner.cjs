'use strict';
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {Runner} = require('./runner.cjs');

const OUTPUT_LIMIT = 256 * 1024;
const RESULT_LIMIT = 128 * 1024;
const MAX_ROWS = 1000;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const TYPES = new Set(['INTEGER', 'REAL', 'TEXT']);
const ISOLATION = '每个用例在独立进程的新建 SQLite 内存库中执行；仅允许查询（删除题仅允许删除指定表），禁止写文件、加载扩展和附加数据库。Windows Job Object 限制超时、256 MiB 内存并回收进程树。';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const scalar = value => value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));

function validateSqlFixture(problem, cases) {
  if (problem?.kind !== 'sql' || problem.sql?.dialect !== 'sqlite') throw Error('SQL 题目必须使用 SQLite 题目结构');
  const sql = problem.sql;
  if (!['query', 'delete'].includes(sql.mode || 'query')) throw Error('不支持的 SQL 运行模式');
  if (sql.orderBy && (!sql.orderMatters || !Array.isArray(sql.orderBy) || !sql.orderBy.length || sql.orderBy.some(k => !IDENTIFIER.test(k.column) || !['asc','desc'].includes(k.direction)))) throw Error('SQL orderBy 必须提供有效排序字段和方向');
  if (typeof sql.orderMatters !== 'boolean') throw Error('SQL 题目必须明确 orderMatters');
  if (!Array.isArray(sql.tables) || !sql.tables.length || sql.tables.length > 20) throw Error('SQL 题目需要 1 至 20 张表');
  const names = new Set();
  for (const table of sql.tables) {
    if (!table || !IDENTIFIER.test(table.name) || /^sqlite_/i.test(table.name) || names.has(table.name.toLowerCase())) throw Error('表名无效、重复或为 SQLite 保留名称');
    names.add(table.name.toLowerCase());
    if (!Array.isArray(table.columns) || !table.columns.length || table.columns.length > 64) throw Error('每张表需要 1 至 64 列');
    const columns = new Set();
    for (const column of table.columns) {
      if (!column || !IDENTIFIER.test(column.name) || columns.has(column.name.toLowerCase())) throw Error('列名无效或重复');
      if (!TYPES.has(column.type)) throw Error('列类型仅允许 INTEGER、REAL、TEXT');
      columns.add(column.name.toLowerCase());
    }
  }
  if (sql.mode === 'delete' && !sql.tables.some(table => table.name === sql.resultTable)) throw Error('删除题必须指定有效的 resultTable');
  if (!Array.isArray(cases) || !cases.length || cases.length > 100) throw Error('请提供 1 至 100 个 SQL 测试用例');
  if (Buffer.byteLength(JSON.stringify(cases), 'utf8') > 2 * 1024 * 1024) throw Error('SQL 用例合计必须小于 2 MiB');
  for (const [index, sample] of cases.entries()) {
    const label = '用例 ' + (index + 1) + '：';
    if (!Array.isArray(sample.input) || sample.input.length !== 1 || !sample.input[0] || typeof sample.input[0] !== 'object' || Array.isArray(sample.input[0])) throw Error(label + 'input 必须是仅包含一组表数据的数组');
    const data = sample.input[0];
    if (Object.keys(data).length !== sql.tables.length || sql.tables.some(table => !own(data, table.name))) throw Error(label + '表名必须与题目定义完全一致，且不得缺失或增加表');
    for (const table of sql.tables) {
      const rows = data[table.name];
      if (!Array.isArray(rows) || rows.length > 10000) throw Error(label + '每张输入表最多 10000 行');
      for (const row of rows) {
        if (!Array.isArray(row) || row.length !== table.columns.length) throw Error(label + table.name + ' 的行列数不匹配');
        for (let i = 0; i < row.length; i++) {
          const value = row[i], type = table.columns[i].type;
          if (value === null) continue;
          if (type === 'TEXT' ? typeof value !== 'string' : type === 'INTEGER' ? !Number.isSafeInteger(value) : typeof value !== 'number' || !Number.isFinite(value)) throw Error(label + table.name + '.' + table.columns[i].name + ' 的值不符合 ' + type + ' 类型');
        }
      }
    }
    const expected = sample.expected;
    if (!expected || !Array.isArray(expected.columns) || !expected.columns.length || expected.columns.length > 128 || expected.columns.some(name => typeof name !== 'string' || !name.length || name.length > 128)) throw Error(label + 'expected.columns 必须是有效列名数组');
    if (!Array.isArray(expected.rows) || expected.rows.length > MAX_ROWS || expected.rows.some(row => !Array.isArray(row) || row.length !== expected.columns.length || row.some(value => !scalar(value)))) throw Error(label + 'expected.rows 无效，最多 1000 行，单元格仅允许文本、有限数字或 null');
  }
}

function equalCell(left, right) {
  if (typeof left !== typeof right) return false;
  if (typeof left === 'number') return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 1e-6 * Math.max(1, Math.abs(left), Math.abs(right));
  return left === right;
}
function equalRow(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, i) => equalCell(value, right[i]));
}
function compareSql(expected, actual, orderMatters = false, orderBy) {
  if (!actual || !Array.isArray(actual.columns) || !Array.isArray(actual.rows) || expected.columns.length !== actual.columns.length ||
      expected.columns.some((name, i) => name.toLowerCase() !== String(actual.columns[i]).toLowerCase()) || expected.rows.length !== actual.rows.length) return false;
  if (orderMatters && orderBy?.length) {
    if (!compareSql(expected, actual, false)) return false;
    const keys=orderBy.map(key=>({...key,index:actual.columns.findIndex(c=>c.toLowerCase()===key.column.toLowerCase())}));
    if(keys.some(key=>key.index<0))return false;
    for(let i=1;i<actual.rows.length;i++){
      for(const key of keys){
        const a=actual.rows[i-1][key.index],b=actual.rows[i][key.index];
        if(equalCell(a,b))continue;
        const cmp=a===null?-1:b===null?1:a<b?-1:1;
        if(cmp*(key.direction==='desc'?-1:1)>0)return false;
        break;
      }
    }
    return true;
  }
  if (orderMatters) return expected.rows.every((row, i) => equalRow(row, actual.rows[i]));
  const canonical = rows => rows.map(row => JSON.stringify(row)).sort();
  const left = canonical(expected.rows), right = canonical(actual.rows);
  if (left.every((row, i) => row === right[i])) return true;
  // Bipartite matching preserves duplicate counts and handles floating-point tolerance.
  const edges = expected.rows.map(row => actual.rows.flatMap((other, i) => equalRow(row, other) ? [i] : []));
  if (edges.some(row => !row.length)) return false;
  const assigned = Array(actual.rows.length).fill(-1);
  const visit = (i, seen) => {
    for (const j of edges[i]) {
      if (seen[j]) continue;
      seen[j] = true;
      if (assigned[j] === -1 || visit(assigned[j], seen)) { assigned[j] = i; return true; }
    }
    return false;
  };
  return edges.every((_, i) => visit(i, Array(actual.rows.length).fill(false)));
}

class SqlRunner {
  constructor({runtimeRoot = path.join(__dirname, '../runtime'), workRoot = path.join(os.tmpdir(), 'hot100-sql-runner')} = {}) {
    this.runtimeRoot = path.resolve(runtimeRoot);
    this.workRoot = path.resolve(workRoot);
    this.runner = new Runner({runtimeRoot: this.runtimeRoot, workRoot: this.workRoot});
    this.running = false;
    this.cancelled = false;
    this.detectPromise = null;
  }
  async detect() {
    if (this.detectPromise) return this.detectPromise;
    this.detectPromise = (async () => {
      const isolation = process.platform === 'win32' && fsSync.existsSync(path.join(this.runtimeRoot, 'runner-job.exe')) ? ISOLATION :
        '每个用例在独立进程的新建 SQLite 内存库执行受限 SQL，具有超时和输出上限；当前环境未检测到 Windows Job Object 内存限制。';
      for (const exe of [path.join(this.runtimeRoot, 'python', 'python.exe'), 'C:\\Python312\\python.exe', 'python3', 'python']) {
        if (path.isAbsolute(exe) && !fsSync.existsSync(exe)) continue;
        const version = await new Promise(resolve => {
          let output = '', done = false;
          const child = spawn(exe, ['-I', '-X', 'utf8', '-c', 'import sqlite3; print(sqlite3.sqlite_version)'], {windowsHide: true, env: this.runner.env(this.workRoot, exe)});
          const finish = value => { if (!done) { done = true; clearTimeout(timer); resolve(value); } };
          const timer = setTimeout(() => { child.kill(); finish(null); }, 5000);
          child.stdout.on('data', chunk => { if (output.length < 100) output += chunk.toString('utf8'); });
          child.stderr.on('data', () => {});
          child.on('error', () => finish(null));
          child.on('close', code => finish(code === 0 && /^\d+\.\d+\.\d+$/.test(output.trim()) ? output.trim() : null));
        });
        if (version) return {available: true, path: exe, version: 'SQLite ' + version, dialect: 'sqlite', isolation};
      }
      return {available: false, path: null, version: null, dialect: 'sqlite', isolation};
    })();
    return this.detectPromise;
  }
  stop() { this.cancelled = true; this.runner.stop(); }
  async run({problem, language = 'sql', code, cases, timeoutMs = 3000}) {
    if (this.running) return {status: 'error', passed: 0, total: 0, cases: [], error: '已有 SQL 运行任务，请先停止。'};
    this.running = true; this.cancelled = false; this.runner.cancelled = false;
    const start = Date.now(); let cwd;
    const result = {status: 'error', passed: 0, total: Array.isArray(cases) ? cases.length : 0, cases: [], durationMs: 0, language,
      limits: {timeoutMs: Math.max(100, Math.min(Number(timeoutMs) || 3000, 30000)), outputBytes: OUTPUT_LIMIT, resultBytes: RESULT_LIMIT, resultRows: MAX_ROWS, memoryMb: 256}, isolation: ISOLATION};
    try {
      if (language !== 'sql') throw Error('SQL 题目仅支持 SQL 语言');
      if (typeof code !== 'string' || !code.trim() || Buffer.byteLength(code, 'utf8') > 256000) throw Error('SQL 代码不能为空且必须小于 256 KB');
      validateSqlFixture(problem, cases);
      const detected = await this.detect(); result.isolation = detected.isolation;
      if (!detected.available) throw Error('未检测到 SQLite 运行环境，请重新安装完整应用。');
      if (this.cancelled) { result.status = 'cancelled'; return result; }
      await fs.mkdir(this.workRoot, {recursive: true});
      cwd = await fs.mkdtemp(path.join(this.workRoot, 'sql-'));
      // Copy out of app.asar so the separately launched Python process can read it.
      await fs.writeFile(path.join(cwd, 'sql-harness.py'), await fs.readFile(path.join(__dirname, 'sql-harness.py')));
      for (const sample of cases) {
        if (this.cancelled) break;
        const payload = {sql: problem.sql, code, data: sample.input[0], timeoutMs: result.limits.timeoutMs, maxRows: MAX_ROWS, maxBytes: RESULT_LIMIT};
        await fs.writeFile(path.join(cwd, 'input.json'), JSON.stringify(payload), 'utf8');
        const raw = await this.runner.execute(detected.path, ['-I', '-X', 'utf8', '-B', path.join(cwd, 'sql-harness.py'), path.join(cwd, 'input.json')], cwd, result.limits.timeoutMs, 256);
        let actual = null, error = raw.error;
        if (!error) {
          try {
            const response = JSON.parse(raw.stdout);
            if (response.error) error = response.error;
            else actual = response.actual;
          } catch { error = 'SQLite 未返回可解析的结果'; }
        }
        const passed = !error && compareSql(sample.expected, actual, problem.sql.orderMatters, problem.sql.orderBy);
        result.cases.push({...sample, actual, passed, error: error || null, stdout: '', stderr: raw.stderr, durationMs: raw.durationMs});
        if (passed) result.passed++;
      }
      result.status = this.cancelled ? 'cancelled' : result.passed === result.total ? 'passed' : 'failed';
    } catch (error) {
      result.error = error.message; result.status = this.cancelled ? 'cancelled' : 'error';
    } finally {
      this.running = false; result.durationMs = Date.now() - start;
      if (cwd) {
        try { await fs.rm(cwd, {recursive: true, force: true, maxRetries: 2}); }
        catch { result.cleanupWarning = '部分 SQL 临时文件未清理；关闭软件后可清理运行目录。'; }
      }
    }
    return result;
  }
}
module.exports = {SqlRunner, compareSql, validateSqlFixture};
