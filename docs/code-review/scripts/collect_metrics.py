"""Collects the code metrics for the Sprint 6 static code review (docs/code-review/README.md).

Inputs (produce them first, see the README):
  server/target/pmd.xml, server/target/cpd.xml   ./mvnw compile pmd:pmd pmd:cpd   (in server/)
  docs/code-review/data/sonar-*.json             exported from the SonarQube web API
The frontend is measured here by running ESLint (via npx) with eslint-metrics.config.js.

Outputs, all under docs/code-review/:
  data/java-method-metrics.csv   every Java method: cyclomatic + cognitive complexity, NCSS, LOC
  data/js-function-metrics.csv   every JavaScript function: cyclomatic complexity, statements, LOC
  data/summary.json              aggregates used in the report
  img/*.png                      charts

Run from the repository root:  python -I docs/code-review/scripts/collect_metrics.py
"""
import csv
import json
import re
import shutil
import statistics
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs" / "code-review"
DATA = OUT / "data"
IMG = OUT / "img"
JAVA_SRC = ROOT / "server" / "src" / "main" / "java"

# chart colours
SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
SERIES = ["#2a78d6", "#eb6834"]  # 1 = Java, 2 = JavaScript
THRESHOLD = "#e34948"

COMPLEXITY_LIMIT = 10  # common cyclomatic complexity limit (PMD / Sonar S1541 default)
LOC_LIMIT = 30         # lines per method we treat as "long"


# ---------------------------------------------------------------- Java (PMD)

def method_end_line(lines, begin):
    """Line of the closing brace of the method declared at 1-based line `begin` (brace matching)."""
    depth, started = 0, False
    in_block_comment = False
    for no in range(begin - 1, len(lines)):
        text = lines[no]
        i = 0
        while i < len(text):
            two = text[i:i + 2]
            if in_block_comment:
                if two == "*/":
                    in_block_comment = False
                    i += 1
            elif two == "//":
                break
            elif two == "/*":
                in_block_comment = True
                i += 1
            elif text[i] in "\"'":
                quote, i = text[i], i + 1
                while i < len(text) and text[i] != quote:
                    i += 2 if text[i] == "\\" else 1
            elif text[i] == ";" and not started:
                return no + 1  # abstract / interface method without a body
            elif text[i] == "{":
                depth, started = depth + 1, True
            elif text[i] == "}":
                depth -= 1
                if started and depth == 0:
                    return no + 1
            i += 1
    return begin


def java_methods():
    ns = {"p": "http://pmd.sourceforge.net/report/2.0.0"}
    tree = ET.parse(ROOT / "server" / "target" / "pmd.xml")
    methods = {}
    for file_el in tree.getroot().findall("p:file", ns):
        path = Path(file_el.get("name"))
        rel = path.relative_to(JAVA_SRC).as_posix() if path.is_absolute() else path.as_posix()
        src = (JAVA_SRC / rel).read_text(encoding="utf-8").splitlines()
        for v in file_el.findall("p:violation", ns):
            method = v.get("method")
            if not method:
                continue  # class-level totals
            line = int(v.get("beginline"))
            m = methods.setdefault((rel, line), {
                "file": rel.split("/")[-1], "class": v.get("class"), "method": method, "line": line,
                "loc": method_end_line(src, line) - line + 1,
            })
            # e.g. "... has a cognitive complexity of 17, current threshold is 1"
            number = int(re.search(r" of (\d+)", v.text).group(1))
            m[{"CyclomaticComplexity": "cyclomatic", "CognitiveComplexity": "cognitive",
               "NcssCount": "ncss"}[v.get("rule")]] = number
    rows = sorted(methods.values(), key=lambda r: (r["file"], r["line"]))
    for r in rows:
        r.setdefault("cyclomatic", 1)
        r.setdefault("cognitive", 0)  # PMD omits methods whose cognitive complexity is 0
        r.setdefault("ncss", 1)
    return rows


def cpd_duplicates():
    tree = ET.parse(ROOT / "server" / "target" / "cpd.xml")
    return [{"lines": int(d.get("lines")), "tokens": int(d.get("tokens"))}
            for d in tree.getroot() if d.tag.endswith("duplication")]


# ---------------------------------------------------------------- JavaScript (ESLint)

def js_functions():
    npx = shutil.which("npx.cmd") or shutil.which("npx")  # npx.cmd first: on Windows "npx" is a shell script
    if not npx:
        sys.exit("npx (Node.js) is needed to measure the frontend")
    result = subprocess.run(
        [npx, "--yes", "eslint@9.39.1", "--no-config-lookup",
         "-c", str(OUT / "scripts" / "eslint-metrics.config.js"), "-f", "json", "js"],
        cwd=ROOT / "client", capture_output=True)
    report = json.loads(result.stdout.decode("utf-8"))
    funcs = []
    for f in report:
        rel = Path(f["filePath"]).relative_to(ROOT / "client").as_posix()
        # The rules report a function at slightly different columns (an arrow function's
        # complexity is reported at the arrow), so match them per start line, in column order.
        by_rule = defaultdict(lambda: defaultdict(list))
        for m in sorted(f["messages"], key=lambda m: (m["line"], m["column"])):
            by_rule[m["ruleId"]][m["line"]].append(m)
        for line, complexity_msgs in by_rule["complexity"].items():
            for i, m in enumerate(complexity_msgs):
                def value(rule, pattern, default):
                    msgs = by_rule[rule].get(line, [])
                    return int(re.search(pattern, msgs[i]["message"]).group(1)) if i < len(msgs) else default
                funcs.append({
                    "file": rel, "line": line,
                    "function": re.search(r"^(.*?) has ", m["message"]).group(1),
                    "cyclomatic": int(re.search(r"complexity of (\d+)", m["message"]).group(1)),
                    "statements": value("max-statements", r"statements \((\d+)\)", 0),
                    "loc": value("max-lines-per-function", r"lines \((\d+)\)", 1),
                })
    return sorted(funcs, key=lambda r: (r["file"], r["line"]))


# ---------------------------------------------------------------- output

def write_csv(path, rows, fields):
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def stats(values):
    return {"count": len(values), "mean": round(statistics.mean(values), 2),
            "median": statistics.median(values), "max": max(values),
            "p90": sorted(values)[int(0.9 * (len(values) - 1))]}


def style(ax, title):
    ax.set_facecolor(SURFACE)
    ax.figure.set_facecolor(SURFACE)
    ax.set_title(title, loc="left", color=INK, fontsize=12, pad=12)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=INK_2, labelsize=9)
    ax.set_axisbelow(True)


def bucket(values, edges):
    """Counts per bucket; edges like [(1, 1), (2, 4), ..., (11, None)]."""
    return [sum(1 for v in values if v >= lo and (hi is None or v <= hi)) for lo, hi in edges]


def grouped_buckets(java, js, edges, labels, title, xlabel, path):
    fig, ax = plt.subplots(figsize=(8, 4.2), dpi=150)
    style(ax, title)
    width = 0.38
    xs = range(len(edges))
    for i, (name, values) in enumerate((("Java methods", java), ("JavaScript functions", js))):
        counts = bucket(values, edges)
        offset = (i - 0.5) * (width + 0.02)
        bars = ax.bar([x + offset for x in xs], counts, width, color=SERIES[i], label=name,
                      edgecolor=SURFACE, linewidth=1)
        for b, c in zip(bars, counts):
            if c:
                ax.text(b.get_x() + b.get_width() / 2, c + 0.8, str(c), ha="center", va="bottom",
                        color=INK_2, fontsize=8)
    ax.set_xticks(list(xs), labels)
    ax.set_xlabel(xlabel, color=INK_2, fontsize=9)
    ax.set_ylabel("Number of methods / functions", color=INK_2, fontsize=9)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.legend(frameon=False, fontsize=9, labelcolor=INK)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def top_bar(rows, value, label, title, limit, path, color):
    top = sorted(rows, key=lambda r: r[value], reverse=True)[:12][::-1]
    fig, ax = plt.subplots(figsize=(8, 4.8), dpi=150)
    style(ax, title)
    vals = [r[value] for r in top]
    ax.barh([label(r) for r in top], vals, color=color, height=0.6, edgecolor=SURFACE, linewidth=1)
    for y, v in enumerate(vals):
        ax.text(v + 0.2, y, str(v), va="center", color=INK_2, fontsize=8)
    ax.axvline(limit, color=THRESHOLD, linewidth=1.5, linestyle="--")
    ax.text(limit, len(top) - 0.4, f" limit {limit}", color=THRESHOLD, fontsize=8, va="bottom")
    ax.set_xlim(0, max(max(vals), limit) * 1.12)
    ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    ax.tick_params(axis="y", labelsize=8)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def issues_chart(issues, path):
    by_quality = defaultdict(int)
    for issue in issues:
        for impact in issue.get("impacts", []):
            by_quality[impact["softwareQuality"].capitalize()] += 1
    order = ["Security", "Reliability", "Maintainability"]
    counts = [by_quality.get(q, 0) for q in order]
    fig, ax = plt.subplots(figsize=(8, 2.6), dpi=150)
    style(ax, "Open SonarQube issues by software quality")
    ax.barh(order[::-1], counts[::-1], color=SERIES[0], height=0.55)
    for y, v in enumerate(counts[::-1]):
        ax.text(v + 0.1, y, str(v), va="center", color=INK_2, fontsize=9)
    ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_xlabel("Issues (one issue can affect more than one quality)", color=INK_2, fontsize=9)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    IMG.mkdir(parents=True, exist_ok=True)

    java = java_methods()
    js = js_functions()
    dups = cpd_duplicates()
    issues = json.loads((DATA / "sonar-issues.json").read_text(encoding="utf-8"))["issues"]

    write_csv(DATA / "java-method-metrics.csv", java,
              ["file", "class", "method", "line", "cyclomatic", "cognitive", "ncss", "loc"])
    write_csv(DATA / "js-function-metrics.csv", js,
              ["file", "function", "line", "cyclomatic", "statements", "loc"])

    summary = {
        "java": {
            "methods": len(java),
            "cyclomatic": stats([m["cyclomatic"] for m in java]),
            "cognitive": stats([m["cognitive"] for m in java]),
            "loc": stats([m["loc"] for m in java]),
            "over_complexity_limit": [m for m in java if m["cyclomatic"] > COMPLEXITY_LIMIT],
            "over_loc_limit": [m for m in java if m["loc"] > LOC_LIMIT],
            "top_cyclomatic": sorted(java, key=lambda m: m["cyclomatic"], reverse=True)[:10],
            "top_loc": sorted(java, key=lambda m: m["loc"], reverse=True)[:10],
            "cpd_duplications_50_tokens": dups,
        },
        "js": {
            "functions": len(js),
            "cyclomatic": stats([f["cyclomatic"] for f in js]),
            "loc": stats([f["loc"] for f in js]),
            "over_complexity_limit": [f for f in js if f["cyclomatic"] > COMPLEXITY_LIMIT],
            "over_loc_limit": [f for f in js if f["loc"] > LOC_LIMIT],
            "top_cyclomatic": sorted(js, key=lambda f: f["cyclomatic"], reverse=True)[:10],
            "top_loc": sorted(js, key=lambda f: f["loc"], reverse=True)[:10],
        },
        "limits": {"cyclomatic": COMPLEXITY_LIMIT, "loc": LOC_LIMIT},
    }
    (DATA / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

    grouped_buckets([m["cyclomatic"] for m in java], [f["cyclomatic"] for f in js],
                    [(1, 1), (2, 4), (5, 7), (8, 10), (11, None)], ["1", "2-4", "5-7", "8-10", ">10"],
                    "Cyclomatic complexity per method / function", "Cyclomatic complexity",
                    IMG / "complexity-distribution.png")
    grouped_buckets([m["loc"] for m in java], [f["loc"] for f in js],
                    [(1, 5), (6, 10), (11, 20), (21, 30), (31, 50), (51, None)],
                    ["1-5", "6-10", "11-20", "21-30", "31-50", ">50"],
                    "Lines of code per method / function", "Physical lines (signature to closing brace)",
                    IMG / "loc-distribution.png")
    top_bar(java, "cyclomatic", lambda m: f"{m['class']}.{m['method']}()",
            "Most complex Java methods (cyclomatic complexity)", COMPLEXITY_LIMIT,
            IMG / "java-top-complexity.png", SERIES[0])
    top_bar(js, "cyclomatic", lambda f: f"{f['file'].split('/')[-1]}: {f['function'].split(' ')[-1]}",
            "Most complex JavaScript functions (cyclomatic complexity)", COMPLEXITY_LIMIT,
            IMG / "js-top-complexity.png", SERIES[1])
    issues_chart(issues, IMG / "sonar-issues-by-quality.png")

    print(json.dumps({k: {kk: vv for kk, vv in v.items() if not isinstance(vv, list)}
                      for k, v in summary.items()}, indent=1))


if __name__ == "__main__":
    main()
