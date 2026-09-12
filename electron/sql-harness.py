"""Restricted SQLite exercise harness. No user Python or persistent database is opened."""
import json
import math
import re
import sqlite3
import sys
import time

IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
TYPES = {"INTEGER", "REAL", "TEXT"}


def quote(name):
    if not isinstance(name, str) or not IDENTIFIER.fullmatch(name):
        raise ValueError("表名或列名无效")
    return '"' + name + '"'


def run(payload):
    definition = payload["sql"]
    mode = definition.get("mode", "query")
    tables = definition["tables"]
    if definition.get("dialect") != "sqlite" or mode not in {"query", "delete"}:
        raise ValueError("不支持的 SQL 题目定义")
    expected_names = [table["name"] for table in tables]
    if set(payload["data"]) != set(expected_names):
        raise ValueError("输入表名与题目定义不一致")
    connection = sqlite3.connect(":memory:", isolation_level=None)
    try:
        connection.enable_load_extension(False)
        connection.execute("PRAGMA trusted_schema = OFF")
        connection.execute("PRAGMA temp_store = MEMORY")
        connection.execute("PRAGMA cache_size = -4096")
        connection.setlimit(sqlite3.SQLITE_LIMIT_ATTACHED, 0)
        connection.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 256 * 1024)
        connection.setlimit(sqlite3.SQLITE_LIMIT_SQL_LENGTH, 256000)
        connection.setlimit(sqlite3.SQLITE_LIMIT_COLUMN, 128)
        connection.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, 100)
        for table in tables:
            name = quote(table["name"])
            columns = table["columns"]
            if not columns or any(column["type"] not in TYPES for column in columns):
                raise ValueError("列类型仅允许 INTEGER、REAL、TEXT")
            definitions = ", ".join(quote(column["name"]) + " " + column["type"] for column in columns)
            connection.execute("CREATE TABLE " + name + " (" + definitions + ")")
            rows = payload["data"][table["name"]]
            if any(not isinstance(row, list) or len(row) != len(columns) for row in rows):
                raise ValueError("输入行的列数不匹配")
            placeholders = ",".join("?" for _ in columns)
            connection.executemany("INSERT INTO " + name + " VALUES (" + placeholders + ")", rows)

        # Only SQLite's compiled-in functions are callable. Extension entry points
        # and schema/pragma virtual tables are never granted by the authorizer.
        builtin_functions = {
            row[0].lower() for row in connection.execute("PRAGMA function_list")
            if row[1] == 1 and row[0].lower() not in {"load_extension", "readfile", "writefile", "edit", "eval"}
        }
        allowed_tables = {name.lower() for name in expected_names}
        result_table = definition.get("resultTable")
        if mode == "delete" and result_table not in expected_names:
            raise ValueError("删除题的目标表不存在")
        if mode == "query":
            connection.execute("PRAGMA query_only = ON")
        denied = [False]
        deleted = [False]

        def authorize(action, first, second, database, source):
            if action in {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_RECURSIVE}:
                return sqlite3.SQLITE_OK
            if action == sqlite3.SQLITE_READ and (database == "main" or (database is None and second == "")) and (first or "").lower() in allowed_tables:
                return sqlite3.SQLITE_OK
            if action == sqlite3.SQLITE_FUNCTION and (second or first or "").lower() in builtin_functions:
                return sqlite3.SQLITE_OK
            if action == sqlite3.SQLITE_DELETE and mode == "delete" and database == "main" and (first or "").lower() == result_table.lower():
                deleted[0] = True
                return sqlite3.SQLITE_OK
            denied[0] = True
            return sqlite3.SQLITE_DENY

        connection.set_authorizer(authorize)
        expired = [False]
        deadline = time.monotonic() + max(0.05, payload["timeoutMs"] / 1000.0 - 0.05)

        def progress():
            if time.monotonic() > deadline:
                expired[0] = True
                return 1
            return 0

        connection.set_progress_handler(progress, 1000)
        code = payload["code"].lstrip("\ufeff")
        first = re.match(r"\s*(?:(?:--[^\n]*(?:\n|$)|/\*.*?\*/)\s*)*([A-Za-z]+)", code, re.DOTALL)
        keyword = first.group(1).upper() if first else ""
        if keyword not in ({"SELECT", "WITH"} if mode == "query" else {"DELETE", "WITH"}):
            raise ValueError("本题仅允许单条 SELECT/WITH 查询" if mode == "query" else "本题仅允许单条 DELETE 删除指定表")
        try:
            # execute (never executescript) rejects more than one SQL statement.
            cursor = connection.execute(code)
            if mode == "delete":
                if not deleted[0]:
                    raise ValueError("本题必须执行 DELETE 语句")
                table = next(table for table in tables if table["name"] == result_table)
                cursor = connection.execute("SELECT " + ", ".join(quote(column["name"]) for column in table["columns"]) + " FROM " + quote(result_table))
            if cursor.description is None:
                raise ValueError("查询未返回结果表")
            columns = [column[0] for column in cursor.description]
            rows = []
            size = len(json.dumps(columns, ensure_ascii=True).encode("ascii"))
            for row in cursor:
                if len(rows) >= payload["maxRows"]:
                    raise ValueError("查询结果超过 " + str(payload["maxRows"]) + " 行上限，请检查查询条件")
                for cell in row:
                    if isinstance(cell, bytes):
                        raise ValueError("结果不支持 BLOB；请返回文本、数字或 NULL")
                    if isinstance(cell, float) and not math.isfinite(cell):
                        raise ValueError("结果包含非有限数字")
                    if isinstance(cell, int) and abs(cell) > 9007199254740991:
                        raise ValueError("整数结果超出可精确显示范围；请将大整数显式 CAST 为 TEXT")
                size += len(json.dumps(row, ensure_ascii=True, allow_nan=False).encode("ascii")) + 2
                if size > payload["maxBytes"]:
                    raise ValueError("查询结果超过 128 KiB 上限，请减少返回内容")
                rows.append(list(row))
            return {"actual": {"columns": columns, "rows": rows}}
        except sqlite3.Error as error:
            if expired[0]:
                raise ValueError("执行超时") from error
            if denied[0]:
                raise ValueError("SQL 操作被限制：禁止修改非目标数据、访问系统表、PRAGMA、附加数据库或加载扩展") from error
            if "one statement" in str(error).lower():
                raise ValueError("每次只能执行一条 SQL 语句") from error
            raise ValueError("SQLite 错误：" + str(error)) from error
    finally:
        connection.close()


def main():
    try:
        with open(sys.argv[1], "r", encoding="utf-8") as source:
            payload = json.load(source)
        response = run(payload)
    except Exception as error:
        response = {"error": str(error)}
    print(json.dumps(response, ensure_ascii=True, allow_nan=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
