"""Add MySQL SQL 50 metadata without changing SQLite statements or fixture expectations.

Requires the tracked official statement cache. This supplements sql-build-catalog.py;
run it after rebuilding the original SQLite catalog.
"""
from pathlib import Path
import html
import json
import re

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data/sql-official-cache"

MYSQL_NOTES = {
    "sql-1683": "MySQL 使用 CHAR_LENGTH(content) 统计字符数；LENGTH(content) 统计字节数。",
    "sql-197": "MySQL 可使用 DATEDIFF(当天日期, 前一天日期) = 1 比较相邻自然日。",
    "sql-1934": "MySQL 的 / 是除法，DIV 才是整数除法；确认率应四舍五入到小数点后 2 位。",
    "sql-620": "官方缓存将 rating 声明为 FLOAT(2, 1)，但示例含两位小数。题面保留原始声明，本地建表使用 FLOAT，避免导入时把示例评分舍入为一位小数。",
    "sql-1193": "MySQL 可使用 DATE_FORMAT(trans_date, '%Y-%m') 提取年月。",
    "sql-550": "MySQL 可使用 DATE_ADD(日期, INTERVAL 1 DAY) 计算次日，日期列使用 DATE 类型。",
    "sql-1204": "MySQL 8 支持 SUM(...) OVER(ORDER BY ...) 窗口累计。",
    "sql-1341": "两行结果可能相同，UNION ALL 保留重复行；带 ORDER BY 与 LIMIT 的子查询需要单独括起并命名。",
    "sql-1667": "MySQL 可使用 CONCAT、UPPER、LOWER 和 SUBSTRING 拼接并修正名字大小写。",
    "sql-1527": "MySQL 支持 REGEXP 与 REGEXP_LIKE；注意疾病代码必须从字符串开头或空格后开始匹配。",
    "sql-196": "MySQL 支持 DELETE p1 FROM Person p1 JOIN Person p2 ... 自连接删除；只比较本用例执行后的 Person 剩余记录。",
    "sql-1484": "MySQL 可使用 GROUP_CONCAT(DISTINCT product ORDER BY product SEPARATOR ',') 去重、排序并连接。原题公开示例将输入 T-Shirt 写为输出 T-shirt；此处保持输入商品名大小写，原文缓存保留。",
    "sql-1517": "MySQL 的正则匹配受列排序规则影响。可以使用 REGEXP_LIKE(mail, 正则, 'c') 明确区分大小写，确保域名严格为 @leetcode.com。",
}

MYSQL_OVERRIDES = {
    "sql-1683": "SELECT tweet_id FROM Tweets WHERE CHAR_LENGTH(content)>15;",
    "sql-197": "SELECT w.id FROM Weather w JOIN Weather p ON DATEDIFF(w.recordDate,p.recordDate)=1 WHERE w.temperature>p.temperature;",
    "sql-1193": "SELECT DATE_FORMAT(trans_date,'%Y-%m') AS month,country,COUNT(*) AS trans_count,SUM(CASE WHEN state='approved' THEN 1 ELSE 0 END) AS approved_count,SUM(amount) AS trans_total_amount,SUM(CASE WHEN state='approved' THEN amount ELSE 0 END) AS approved_total_amount FROM Transactions GROUP BY month,country;",
    "sql-550": "WITH firsts AS (SELECT player_id,MIN(event_date) AS first_date FROM Activity GROUP BY player_id) SELECT ROUND(AVG(CASE WHEN EXISTS(SELECT 1 FROM Activity a WHERE a.player_id=f.player_id AND a.event_date=DATE_ADD(f.first_date,INTERVAL 1 DAY)) THEN 1.0 ELSE 0 END),2) AS fraction FROM firsts f;",
    "sql-619": "SELECT MAX(num) AS num FROM (SELECT num FROM MyNumbers GROUP BY num HAVING COUNT(*)=1) AS single_numbers;",
    "sql-1341": "SELECT name AS results FROM (SELECT u.name FROM Users u JOIN MovieRating r ON u.user_id=r.user_id GROUP BY u.user_id,u.name ORDER BY COUNT(*) DESC,u.name LIMIT 1) AS most_active UNION ALL SELECT title FROM (SELECT m.title FROM Movies m JOIN MovieRating r ON m.movie_id=r.movie_id WHERE created_at>='2020-02-01' AND created_at<'2020-03-01' GROUP BY m.movie_id,m.title ORDER BY AVG(rating) DESC,m.title LIMIT 1) AS top_movie;",
    "sql-1667": "SELECT user_id,CONCAT(UPPER(SUBSTRING(name,1,1)),LOWER(SUBSTRING(name,2))) AS name FROM Users ORDER BY user_id;",
    "sql-1527": "SELECT patient_id,patient_name,conditions FROM Patients WHERE REGEXP_LIKE(conditions,'(^| )DIAB1','c');",
    "sql-196": "DELETE p1 FROM Person p1 JOIN Person p2 ON p1.Email=p2.Email AND p1.Id>p2.Id;",
    "sql-1484": "SELECT sell_date,COUNT(DISTINCT product) AS num_sold,GROUP_CONCAT(DISTINCT product ORDER BY product SEPARATOR ',') AS products FROM Activities GROUP BY sell_date ORDER BY sell_date;",
    "sql-1517": "SELECT user_id,name,mail FROM Users WHERE REGEXP_LIKE(mail,'^[A-Za-z][A-Za-z0-9_.-]*@leetcode[.]com$','c');",
}


def table_html(columns, rows):
    return "<table><thead><tr>" + "".join("<th>" + html.escape(c) + "</th>" for c in columns) + "</tr></thead><tbody>" + "".join("<tr>" + "".join("<td>" + html.escape(str(v)) + "</td>" for v in row) + "</tr>" for row in rows) + "</tbody></table>"


def build():
    problems_path = ROOT / "data/sql-problems.json"
    problems = json.loads(problems_path.read_text(encoding="utf-8-sig"))
    sqlite_references = json.loads((ROOT / "scripts/sql-reference-solutions.json").read_text(encoding="utf-8-sig"))
    mysql_references = {}
    assert len(problems) == 50
    for problem in problems:
        key = problem["id"]
        question = json.loads((CACHE / (problem["displayId"] + ".json")).read_text(encoding="utf-8-sig"))
        schema = json.loads(question["metaData"])["database_schema"]
        mysql_tables = [{"name": name, "columns": [{"name": name, "type": typ} for name, typ in cols.items()]} for name, cols in schema.items()]
        assert [t["name"] for t in mysql_tables] == [t["name"] for t in problem["sql"]["tables"]]
        assert [[c["name"] for c in t["columns"]] for t in mysql_tables] == [[c["name"] for c in t["columns"]] for t in problem["sql"]["tables"]]
        problem["sql"]["mysqlTables"] = mysql_tables
        problem["sql"]["mysqlDialectNotes"] = MYSQL_NOTES.get(key, "")
        content = problem["content"]
        schema_html = "<h3>表结构</h3>" + "".join("<h4>" + html.escape(t["name"]) + "</h4>" + table_html(["字段", "MySQL 类型"], [[c["name"], c["type"]] for c in t["columns"]]) for t in mysql_tables)
        mysql_content, substitutions = re.subn(r"<h3>表结构</h3>.*?<h3>说明与约束</h3>", lambda _: schema_html + "<h3>说明与约束</h3>", content, count=1, flags=re.S)
        assert substitutions == 1, key
        mysql_content, substitutions = re.subn(r"<h3>本地 SQL 方言</h3>.*$", lambda _: "<h3>本地 SQL 方言</h3><p>本地使用 MySQL 8。表数据已自动装入独立题目库，无需创建表或插入数据。" + html.escape(MYSQL_NOTES.get(key, "")) + "</p>", mysql_content, count=1, flags=re.S)
        assert substitutions == 1, key
        if key == "sql-196":
            mysql_content = mysql_content.replace("删除只作用于本用例的临时内存表。", "删除只作用于本用例的独立题目库。")
        problem["contentByDialect"] = {"sqlite": content, "mysql": mysql_content}
        problem["templates"]["mysql"] = "-- 在下方编写 MySQL " + ("DELETE 语句" if key == "sql-196" else "查询") + "\n"
        mysql_references[key] = MYSQL_OVERRIDES.get(key, sqlite_references[key])
    problems_path.write_text(json.dumps(problems, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "scripts/mysql-reference-solutions.json").write_text(json.dumps(mysql_references, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Added MySQL metadata and reference queries for", len(problems), "SQL 50 questions")


if __name__ == "__main__":
    build()
