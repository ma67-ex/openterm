"""Cross-check the JS backtest (public/mods/btlib.js) against the original Python backtester.

Runs ../stock-backtester/backtester.py's own run_backtest() and performance() on the stored
fixtures and compares them with the JS output for the same prices, element by element.

Setup once:  python3 -m venv scripts/.venv && scripts/.venv/bin/pip install pandas numpy
Run:         scripts/.venv/bin/python scripts/crosscheck.py
"""

import json
import subprocess
import sys
import types
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SOURCE = ROOT.parent / "stock-backtester"

# backtester.py imports yfinance and matplotlib at the top. Neither is needed to run the math
# on stored prices, so stub them instead of installing them.
for name in ("yfinance", "matplotlib", "matplotlib.pyplot"):
    sys.modules.setdefault(name, types.ModuleType(name))
sys.path.insert(0, str(SOURCE))
import backtester  # noqa: E402

TOL = 1e-9
CASES = [("AAPL", 50, 200), ("SPY", 50, 200), ("VFC", 50, 200), ("AAPL", 20, 100)]

JS = """
import { readFileSync } from 'node:fs';
import { backtest } from './public/mods/btlib.js';
const [sym, fast, slow] = process.argv.slice(1);
const close = JSON.parse(readFileSync(`./scripts/fixtures/${sym}.json`)).close;
const r = backtest(close, +fast, +slow, { from: 0 });
console.log(JSON.stringify({ pos: r.pos, eqS: r.eqS, eqH: r.eqH, strategy: r.strategy, hold: r.hold }));
"""


def js_run(sym, fast, slow):
    out = subprocess.run(["node", "--input-type=module", "-e", JS, sym, str(fast), str(slow)],
                         cwd=ROOT, check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def max_rel_diff(a, b):
    return max(abs(x - y) / max(abs(y), 1e-12) for x, y in zip(a, b))


def as_python_strings(s):
    # the same formatting performance() applies, so the comparison is like for like
    return {
        "Total return": f"{s['total']:6.1%}",
        "CAGR": f"{s['cagr']:6.1%}",
        "Sharpe": f"{s['sharpe']:6.2f}",
        "Max drawdown": f"{s['maxDD']:6.1%}",
    }


failed = False
for sym, fast, slow in CASES:
    fx = json.loads((HERE / "fixtures" / f"{sym}.json").read_text())
    df = pd.DataFrame({"price": fx["close"]}, index=pd.to_datetime(fx["dates"]))
    py = backtester.run_backtest(df, fast, slow)
    js = js_run(sym, fast, slow)

    checks = {
        "length": len(js["eqS"]) == len(py),
        "positions": list(py["position"].astype(int)) == js["pos"],
        "strategy equity": max_rel_diff(js["eqS"], py["strategy_equity"]) <= TOL,
        "buy & hold equity": max_rel_diff(js["eqH"], py["buy_hold_equity"]) <= TOL,
        "strategy stats": backtester.performance(py["strategy_return"], py["strategy_equity"]) == as_python_strings(js["strategy"]),
        "buy & hold stats": backtester.performance(py["market_return"], py["buy_hold_equity"]) == as_python_strings(js["hold"]),
    }
    bad = [k for k, ok in checks.items() if not ok]
    failed |= bool(bad)
    diff = max_rel_diff(js["eqS"], py["strategy_equity"])
    print(f"{sym} {fast}/{slow}: {'MATCH' if not bad else 'MISMATCH in ' + ', '.join(bad)} "
          f"({len(py)} days, max equity difference {diff:.1e})")

sys.exit(1 if failed else 0)
