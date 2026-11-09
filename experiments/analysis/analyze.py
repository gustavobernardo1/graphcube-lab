#!/usr/bin/env python3
"""
GraphCube Lab — statistical analysis of the experiment outputs.

Reads   experiments/results/E*.json  (produced by `npm run experiments`)
Writes  experiments/figures/*.pdf|png        figures used by the paper
        paper/generated/tables/*.tex          LaTeX tables
        paper/generated/numbers.tex           \\newcommand macros for every number quoted in the text
        experiments/analysis/summary.json     machine-readable summary

Nothing here generates data: every value is computed from the JSON rows.
Usage:  python3 experiments/analysis/analyze.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "experiments" / "results"
FIG = ROOT / "experiments" / "figures"
GEN = ROOT / "paper" / "generated"
TAB = GEN / "tables"
for d in (FIG, GEN, TAB):
    d.mkdir(parents=True, exist_ok=True)

plt.rcParams.update({
    "figure.dpi": 150, "savefig.bbox": "tight", "font.size": 9, "axes.titlesize": 9.5,
    "axes.labelsize": 9, "legend.fontsize": 7.5, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.alpha": 0.25, "font.family": "serif",
})
COLORS = {"BFS": "#4c72b0", "BFS bidirecional": "#55a868", "A*": "#c44e52", "IDA*": "#8172b2",
          "zero": "#7f7f7f", "misplaced": "#dd8452", "pdb-ori": "#55a868", "pdb-perm": "#4c72b0",
          "pdb-max": "#c44e52", "exact": "#000000", "pdb": "#c44e52"}
HLABEL = {"zero": r"$h_0$", "misplaced": r"$h_{\mathrm{pec}}$", "pdb-ori": r"$h_{\mathrm{ori}}$",
          "pdb-perm": r"$h_{\mathrm{perm}}$", "pdb-max": r"$h_{\max}$", "exact": r"$h^*$ (oráculo)", "pdb": r"$h_{\mathrm{PDB}}$"}

numbers: dict[str, str] = {}
summary: dict = {}


def num(name: str, value, fmt: str = "{}") -> None:
    """Registers a LaTeX macro \\gcl<name> with a formatted value."""
    if isinstance(value, float) and math.isnan(value):
        s = "n/d"
    elif isinstance(value, (int, float, np.integer, np.floating)) and not isinstance(value, bool):
        s = "\\num{" + fmt.format(value) + "}"
    else:
        s = fmt.format(value)
    numbers[name] = s


def thousands(x: float | int) -> str:
    return "\\num{" + str(int(round(x))) + "}"


def latexify(t: str) -> str:
    for a, b in (("⟨", "$\\langle$"), ("⟩", "$\\rangle$"), ("×", "$\\times$"), ("₂", "$_2$")):
        t = t.replace(a, b)
    return t


def dec(x: float, p: int = 1) -> str:
    return "---" if (x is None or (isinstance(x, float) and math.isnan(x))) else "\\num{" + f"{x:.{p}f}" + "}"


def load(eid: str) -> tuple[dict, pd.DataFrame]:
    with open(RES / f"{eid}.json", encoding="utf-8") as f:
        d = json.load(f)
    return d["meta"], pd.DataFrame(d["rows"])


def save(fig, name: str) -> None:
    fig.savefig(FIG / f"{name}.pdf")
    fig.savefig(FIG / f"{name}.png", dpi=200)
    plt.close(fig)


def write_table(name: str, body: str) -> None:
    (TAB / f"{name}.tex").write_text(body, encoding="utf-8")


def meta_line(meta: dict) -> str:
    return f"{meta['experiment']} (v{meta['softwareVersion']}, commit {meta['gitCommit']}, semente {meta['seed']})"


# ---------------------------------------------------------------------------- E0
m0, e0 = load("E0")
groups = e0[e0.check == "group-order"]
num("EzeroAllMatch", "todas" if bool(e0.match.all()) else "NEM TODAS")
num("SchreierGTime", float(groups[groups.object.str.startswith("G (3")].timeMs.iloc[0]), "{:.1f}")
rows = []
for _, r in groups.iterrows():
    rows.append(f"{latexify(r.object)} & \\num{{{r.computed}}} & \\num{{{r.literature}}} & {'\\checkmark' if r.match else '$\\times$'} & {dec(r.timeMs)} \\\\")
write_table("tab_e0_groups", "\n".join(rows) + "\n")
dist = {}
for metric in ("HTM", "QTM"):
    sub = e0[e0.check == f"distance-distribution-2x2-{metric}"].copy()
    sub["d"] = sub.object.str[2:].astype(int)
    dist[metric] = sub.sort_values("d").computed.astype(int).tolist()
    num(f"BfsTime{metric}", float(sub.timeMs.dropna().iloc[0]), "{:.0f}")
mean_htm = sum(d * c for d, c in enumerate(dist["HTM"])) / sum(dist["HTM"])
mean_qtm = sum(d * c for d, c in enumerate(dist["QTM"])) / sum(dist["QTM"])
num("MeanDistHTM", mean_htm, "{:.3f}")
num("MeanDistQTM", mean_qtm, "{:.3f}")
num("DiamHTM", len(dist["HTM"]) - 1)
num("DiamQTM", len(dist["QTM"]) - 1)
num("TwoPhaseTables", float(e0[e0.check == "two-phase-tables"].timeMs.iloc[0]), "{:.0f}")
summary["E0"] = {"all_match": bool(e0.match.all()), "dist": dist, "mean_htm": mean_htm, "mean_qtm": mean_qtm}

fig, ax = plt.subplots(figsize=(6.2, 2.4))
for k, (metric, off) in enumerate((("HTM", -0.2), ("QTM", 0.2))):
    ds = np.arange(len(dist[metric]))
    ax.bar(ds + off, dist[metric], width=0.4, label=f"{metric} (diâmetro {len(ds) - 1})", color=["#4c72b0", "#dd8452"][k])
ax.set_yscale("log")
ax.set_xlabel("distância $d^*$ ao estado resolvido")
ax.set_ylabel("número de estados")
ax.set_title(r"2$\times$2$\times$2: distribuição exata de distâncias (BFS completa, 3\,674\,160 estados)")
ax.legend()
save(fig, "fig_e0_distribution")

# ---------------------------------------------------------------------------- E1
m1, e1 = load("E1")
bfs1 = e1[e1.algorithm == "BFS"]
g = bfs1.groupby("scrambleLength").dstar
fig, axes = plt.subplots(1, 2, figsize=(7.0, 2.6))
ax = axes[0]
L = g.mean().index.values
ax.fill_between(L, g.min().values, g.max().values, alpha=0.18, color="#4c72b0", label="mín.–máx.")
ax.plot(L, g.mean().values, "o-", ms=3, color="#4c72b0", label=r"média de $d^*$")
ax.plot(L, np.minimum(L, len(dist["HTM"]) - 1), "--", color="gray", lw=1, label=r"$d^*=L$ (até o diâmetro)")
ax.axhline(mean_htm, color="#c44e52", lw=1, ls=":", label=f"média uniforme {mean_htm:.2f}".replace(".", ","))
ax.set_xlabel("comprimento $L$ do embaralhamento")
ax.set_ylabel(r"$d^*$")
ax.set_title("(a) distância real × comprimento")
ax.legend(loc="lower right")
ax = axes[1]
for alg in ("BFS", "BFS bidirecional"):
    sub = e1[(e1.algorithm == alg) & (e1.dstar > 0)]
    ax.scatter(sub.dstar + (0.12 if alg != "BFS" else -0.12), sub.expanded, s=4, alpha=0.25, color=COLORS[alg])
    mm = sub.groupby("dstar").expanded.mean()
    ax.plot(mm.index, mm.values, "o-", ms=3, color=COLORS[alg], label=alg)
ax.set_yscale("log")
ax.set_xlabel(r"distância real $d^*$")
ax.set_ylabel("nós expandidos")
ax.set_title(r"(b) esforço × $d^*$")
ax.legend()
save(fig, "fig_e1_growth")

# exponential fits on mean expanded vs d* (d* = 3..9) — slope = growth rate
fits = {}
for alg in ("BFS", "BFS bidirecional"):
    mm = e1[(e1.algorithm == alg)].groupby("dstar").expanded.mean()
    mm = mm[(mm.index >= 3) & (mm.index <= 9)]
    b, a = np.polyfit(mm.index.values, np.log(mm.values), 1)
    fits[alg] = math.exp(b)
num("EoneGrowthBFS", fits["BFS"], "{:.2f}")
num("EoneGrowthBi", fits["BFS bidirecional"], "{:.2f}")
num("EoneGrowthRatio", math.sqrt(fits["BFS"]), "{:.2f}")
# Spearman correlations: L vs effort and d* vs effort
from scipy.stats import spearmanr  # noqa: E402

rho_L = spearmanr(bfs1.scrambleLength, bfs1.expanded).correlation
rho_d = spearmanr(bfs1.dstar, bfs1.expanded).correlation
num("EoneRhoL", rho_L, "{:.3f}")
num("EoneRhoD", rho_d, "{:.3f}")
sat = bfs1[bfs1.scrambleLength >= 14].dstar
num("EoneSatMean", sat.mean(), "{:.2f}")
num("EoneSamples", int(m1["params"]["samples"]))
num("EoneMaxL", int(max(m1["params"]["lengths"])))
first_gap = int(bfs1[bfs1.dstar < bfs1.scrambleLength].scrambleLength.min())
num("EoneFirstGap", first_gap)
summary["E1"] = {"growth": fits, "rho_L": rho_L, "rho_d": rho_d, "sat_mean": sat.mean(), "first_gap_L": first_gap}

# ---------------------------------------------------------------------------- E2
m2, e2 = load("E2")
ok2 = e2[e2.success == True]  # noqa: E712
algs = ["BFS", "BFS bidirecional", "A*", "IDA*"]
fig, axes = plt.subplots(1, 3, figsize=(7.2, 2.5))
for ax, col, title in zip(axes, ("expanded", "peakStored", "timeMs"), ("(a) nós expandidos", "(b) pico de estados armazenados", "(c) tempo (ms)")):
    for alg in algs:
        mm = ok2[ok2.algorithm == alg].groupby("dstar")[col]
        mid = mm.median() if col == "timeMs" else mm.mean()
        ax.plot(mid.index, mid.values, "o-", ms=2.5, color=COLORS[alg], label=alg)
    ax.set_yscale("log")
    ax.set_xlabel(r"$d^*$")
    ax.set_title(title)
axes[0].legend()
axes[2].text(0.02, 0.97, "mediana", transform=axes[2].transAxes, va="top", fontsize=7)
save(fig, "fig_e2_algorithms")
rows = []
dmax = int(e2.dstar.max())
for alg in algs:
    sub = e2[e2.algorithm == alg]
    s_ok = sub[sub.success == True]  # noqa: E712
    last = s_ok[s_ok.dstar == dmax]
    rows.append(
        f"{alg} & {100 * sub.success.mean():.0f}\\% & {100 * s_ok.optimal.mean():.0f}\\% & {thousands(last.expanded.mean())} & {thousands(last.peakStored.mean())} & {dec(last.timeMs.median())} \\\\"
    )
    key = alg.replace("*", "star").replace(" ", "").replace("bidirecional", "Bi")
    num(f"Etwo{key}Exp", thousands(last.expanded.mean()))
    num(f"Etwo{key}Peak", thousands(last.peakStored.mean()))
    num(f"Etwo{key}Time", last.timeMs.median(), "{:.1f}")
write_table("tab_e2_summary", "\n".join(rows) + "\n")
num("EtwoSamples", int(m2["params"]["samples"]))
num("EtwoRuns", len(e2))
num("EtwoDmax", dmax)
num("EtwoAllOptimal", "todas" if bool(ok2.optimal.all()) else "NEM TODAS")
summary["E2"] = {"runs": len(e2), "all_success": bool(e2.success.all()), "all_optimal": bool(ok2.optimal.all())}

# ---------------------------------------------------------------------------- E3
m3, e3 = load("E3")
heur = ["zero", "misplaced", "pdb-ori", "pdb-perm", "pdb-max", "exact"]
fig, axes = plt.subplots(1, 3, figsize=(7.2, 2.6))
for ax, alg, title in ((axes[0], "IDA*", "(a) IDA*: nós expandidos"), (axes[1], "A*", "(b) A*: nós expandidos")):
    for h in heur:
        mm = e3[(e3.algorithm == alg) & (e3.heuristic == h) & (e3.success == True)].groupby("dstar").expanded.mean()  # noqa: E712
        ax.plot(mm.index, mm.values, "o-", ms=2.5, color=COLORS[h], label=HLABEL[h])
    ax.set_yscale("log")
    ax.set_xlabel(r"$d^*$")
    ax.set_title(title)
axes[0].legend(ncol=1)
ax = axes[2]
for h in heur:
    mm = e3[(e3.algorithm == "IDA*") & (e3.heuristic == h)].groupby("dstar").h0.mean()
    ax.plot(mm.index, mm.values, "o-", ms=2.5, color=COLORS[h], label=HLABEL[h])
ax.set_xlabel(r"$d^*$")
ax.set_ylabel(r"$h(s_0)$ médio")
ax.set_title(r"(c) valor da heurística no início")
save(fig, "fig_e3_heuristics")
depths3 = sorted(e3.dstar.unique())
show = [d for d in (6, 8, 10, 11) if d in depths3]
rows = []
for h in heur:
    sub = e3[(e3.algorithm == "IDA*") & (e3.heuristic == h)]
    cells = []
    for d in show:
        s = sub[sub.dstar == d]
        okk = s[s.success == True]  # noqa: E712
        if len(okk) < len(s):
            cells.append(f"--- ({len(s) - len(okk)}/{len(s)} lim.)" if len(okk) == 0 else f"{thousands(okk.expanded.mean())}$^\\dagger$")
        else:
            cells.append(thousands(okk.expanded.mean()))
    s10 = sub[(sub.dstar == max(show)) & (sub.success == True)]  # noqa: E712
    ebf = s10.ebf.mean() if len(s10) else float("nan")
    ratio = (sub.h0 / sub.dstar).mean()
    rows.append(f"{HLABEL[h]} & " + " & ".join(cells) + f" & {dec(ebf, 2)} & {dec(ratio, 2)} \\\\")
write_table("tab_e3_heuristics", "\n".join(rows) + "\n")
write_table("tab_e3_heuristics_head", " & ".join(f"$d^*={d}$" for d in show) + "\n")
num("EthreeShowCols", str(len(show)))
num("EthreeLastD", max(show))
def ida_mean(h, d):
    s = e3[(e3.algorithm == "IDA*") & (e3.heuristic == h) & (e3.dstar == d) & (e3.success == True)]  # noqa: E712
    return s.expanded.mean()
dlast = max(show)
num("EthreeMaxOverPerm", ida_mean("pdb-perm", dlast) / ida_mean("pdb-max", dlast), "{:.1f}")
num("EthreeMaxOverOri", ida_mean("pdb-ori", dlast) / ida_mean("pdb-max", dlast), "{:.1f}")
num("EthreeMaxExp", thousands(ida_mean("pdb-max", dlast)))
num("EthreeZeroFailFrom", int(e3[(e3.heuristic == "zero") & (e3.success == False)].dstar.min()))  # noqa: E712
num("EthreeMisFailFrom", int(e3[(e3.heuristic == "misplaced") & (e3.success == False)].dstar.min()) if len(e3[(e3.heuristic == "misplaced") & (e3.success == False)]) else "n/d")  # noqa: E712
num("EthreeNodeLimit", thousands(m3["limits"]["maxNodes"]))
num("EthreeSamples", int(m3["params"]["samples"]))
num("EthreeMisMax", int(e3[e3.heuristic == "misplaced"].h0.max()))
num("EthreeAllOptimal", "todas" if bool(e3[e3.success == True].optimal.all()) else "NEM TODAS")  # noqa: E712
summary["E3"] = {"failures": e3[e3.success == False].groupby(["algorithm", "heuristic"]).size().to_dict().__repr__()}  # noqa: E712

# ---------------------------------------------------------------------------- E3b
m3b, e3b = load("E3b")
sc = e3b[e3b.kind == "scramble"]
fig, axes = plt.subplots(1, 2, figsize=(7.0, 2.6))
ax = axes[0]
for h in ("misplaced", "pdb"):
    mm = sc[(sc.algorithm == "IDA*") & (sc.heuristic == h) & (sc.success == True)].groupby("dstar").expanded.mean()  # noqa: E712
    ax.plot(mm.index, mm.values, "o-", ms=3, color=COLORS[h], label=f"IDA* {HLABEL[h]}")
ax.set_yscale("log")
ax.set_xlabel(r"$d^*$ (comprimento ótimo encontrado por IDA*)")
ax.set_ylabel("nós expandidos")
ax.set_title(r"(a) 3$\times$3$\times$3: IDA* ótimo")
ax.legend()
ax = axes[1]
uni = e3b[e3b.kind == "uniform-random"]
labels = sorted(uni.algorithm.unique())
lens = np.arange(int(uni.length.min()), int(uni.length.max()) + 1)
for k, lab in enumerate(labels):
    cnt = uni[uni.algorithm == lab].length.value_counts().reindex(lens, fill_value=0)
    ax.bar(lens + (k - 0.5) * 0.4, cnt.values, width=0.4, label=lab, color=["#dd8452", "#4c72b0"][k])
ax.set_xlabel("comprimento da solução (HTM)")
ax.set_ylabel("estados")
ax.set_title(f"(b) duas fases em {len(uni) // len(labels)} estados uniformes de $G$")
ax.legend()
save(fig, "fig_e3b_cube3")
rows = []
for Lval in sorted(sc.scrambleLength.unique()):
    s = sc[sc.scrambleLength == Lval]
    pdb = s[(s.algorithm == "IDA*") & (s.heuristic == "pdb")]
    mis = s[(s.algorithm == "IDA*") & (s.heuristic == "misplaced")]
    tp = s[s.algorithm.str.startswith("Duas")]
    mis_cell = f"{thousands(mis.expanded.mean())} & {dec(mis.timeMs.median())}" if len(mis) else "n.e. & n.e."
    rows.append(
        f"{int(Lval)} & {dec(pdb.dstar.mean())} & {thousands(pdb.expanded.mean())} & {dec(pdb.timeMs.median())} & {mis_cell} & {dec(tp.length.mean())} \\\\"
    )
write_table("tab_e3b", "\n".join(rows) + "\n")
for lab in labels:
    u = uni[uni.algorithm == lab]
    key = "First" if "1ª" in lab else "Target"
    num(f"TP{key}Mean", u.length.mean(), "{:.2f}")
    num(f"TP{key}Max", int(u.length.max()))
    num(f"TP{key}Min", int(u.length.min()))
    num(f"TP{key}TimeMed", u.timeMs.median(), "{:.1f}")
    num(f"TP{key}TimeMax", u.timeMs.max(), "{:.0f}")
    num(f"TP{key}Le", (u.length <= 20).mean() * 100, "{:.0f}")
num("TPUniformN", len(uni) // len(labels))
num("EthreebSamples", int(m3b["params"]["samples"]))
pdb_last = sc[(sc.algorithm == "IDA*") & (sc.heuristic == "pdb")]
lmax = int(pdb_last.scrambleLength.max())
num("EthreebLmax", lmax)
num("EthreebPdbTimeLast", pdb_last[pdb_last.scrambleLength == lmax].timeMs.median() / 1000, "{:.1f}")
num("EthreebPdbExpLast", thousands(pdb_last[pdb_last.scrambleLength == lmax].expanded.mean()))
num("EthreebDstarEqL", "sim" if bool((pdb_last.dstar == pdb_last.scrambleLength).all()) else "não")
num("EthreebDstarEqLCount", int((pdb_last.dstar == pdb_last.scrambleLength).sum()))
num("EthreebCount", len(pdb_last))
tp_sc = sc[sc.algorithm.str.startswith("Duas")].merge(pdb_last[["scrambleLength", "sample", "dstar"]], on=["scrambleLength", "sample"], suffixes=("", "_opt"))
num("EthreebTPOptimalPct", (tp_sc.length == tp_sc.dstar_opt).mean() * 100, "{:.0f}")
num("EthreebTPExcessMax", int((tp_sc.length - tp_sc.dstar_opt).max()))
summary["E3b"] = {"tp_uniform": uni.groupby("algorithm").length.describe().to_dict()}

# ---------------------------------------------------------------------------- E4
m4, e4 = load("E4")
fig, axes = plt.subplots(1, 2, figsize=(7.2, 2.7))
sel2 = [r for _, r in e4.iterrows() if r.n == 2]
sel3 = [r for _, r in e4.iterrows() if r.n == 3 and int(r.degree) >= 3]
for ax, sel, title in ((axes[0], sel2, r"(a) 2$\times$2$\times$2 (grafos completos)"), (axes[1], sel3, r"(b) 3$\times$3$\times$3 (bolas exatas até o raio explorado)")):
    for k, r in enumerate(sel):
        sp = [int(x) for x in str(r.sphereSizes).split(";")]
        ax.plot(range(len(sp)), sp, "o-" if r.complete else "s--", ms=2.2, lw=1, label=r.label.split(" ", 1)[1], color=plt.cm.tab10(k % 10))
    ax.set_yscale("log")
    ax.set_xlabel("raio $r$")
    ax.set_ylabel(r"$|S(r)|$")
    ax.set_title(title)
    ax.legend(fontsize=6.2, ncol=1)
save(fig, "fig_e4_spheres")
rows = []
for _, r in e4.iterrows():
    order = f"\\num{{{r.order}}}"
    comp = "sim" if r.complete else f"$r\\le{int(r.exploredRadius)}$"
    diam = "---" if pd.isna(r.diameter) else str(int(r.diameter))
    md = "---" if pd.isna(r.meanDistance) else dec(r.meanDistance, 2)
    gens = r.generators.replace("2", "$^2$") if r.n == 3 and "quadrados" in r.label else r.generators
    rows.append(f"{latexify(r.label)} & {order} & {int(r.degree)} & {comp} & {diam} & {md} & {int(r.girth)} & {int(r.symTotal)} \\\\")
write_table("tab_e4", "\n".join(rows) + "\n")
num("EfourSets", len(e4))
num("EfourMaxNodes", thousands(m4["limits"]["maxNodes3"]))
def e4row(label):
    return e4[e4.label == label].iloc[0]
num("EfourSqDiam", int(e4row("3×3×3 grupo dos quadrados").diameter))
num("EfourSqMean", e4row("3×3×3 grupo dos quadrados").meanDistance, "{:.2f}")
num("EfourRUTwoDiamQ", int(e4row("2×2×2 ⟨R,U⟩ QTM").diameter))
num("EfourRUTwoDiamH", int(e4row("2×2×2 ⟨R,U⟩ HTM").diameter))
num("EfourRUtwoThreeDiam", int(e4row("3×3×3 ⟨R,U2⟩").diameter))
spG = [int(x) for x in str(e4row("3×3×3 G HTM").sphereSizes).split(";")]
spQ = [int(x) for x in str(e4row("3×3×3 G QTM").sphereSizes).split(";")]
num("GhtmSpheres", "; ".join(thousands(x) for x in spG))
num("GqtmSpheres", "; ".join(thousands(x) for x in spQ))
summary["E4"] = e4[["label", "order", "diameter", "meanDistance", "girth", "symTotal"]].to_dict(orient="records")

# ---------------------------------------------------------------------------- outputs
metas = [m0, m1, m2, m3, m3b, m4]
commits = sorted({str(m["gitCommit"]) for m in metas})
num("ResultsCommit", ", ".join(commits))
num("ResultsEnv", m2["environment"].replace("_", "\\_").replace("×", "$\\times$"))
num("ResultsDate", m0["startedAt"][:10])
num("ResultsTotalMin", sum(m["durationMs"] for m in metas) / 60000, "{:.1f}")
lines = ["% Arquivo GERADO por experiments/analysis/analyze.py — não editar à mão.\n"]
for k, v in sorted(numbers.items()):
    lines.append(f"\\newcommand{{\\gcl{k}}}{{{v}}}\n")
(GEN / "numbers.tex").write_text("".join(lines), encoding="utf-8")
summary["numbers"] = numbers
summary["metadata"] = [{k: m[k] for k in ("experiment", "softwareVersion", "gitCommit", "seed", "startedAt", "durationMs", "environment", "limits")} for m in metas]
(ROOT / "experiments" / "analysis" / "summary.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False, default=str), encoding="utf-8")
print(f"OK: {len(list(FIG.glob('*.pdf')))} figuras, {len(list(TAB.glob('*.tex')))} tabelas, {len(numbers)} macros")
