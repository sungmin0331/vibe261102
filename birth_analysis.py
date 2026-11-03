"""KOSIS '출생아수, 합계출산율, 자연증가 등' 엑셀을 정제하고 다각도로 분석하는 GUI 앱 (PyQt6).

사용법:
    pip install PyQt6 pandas openpyxl matplotlib
    python birth_analysis.py ["출생아수__합계출산율__자연증가_등.xlsx"]

엑셀은 '엑셀 열기' 버튼으로 고르거나 창에 끌어다 놓아도 불러온다.
"""

import os
import sys
import warnings

import matplotlib
import numpy as np
import pandas as pd
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg
from matplotlib.figure import Figure
from matplotlib.ticker import FuncFormatter
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor, QIcon
from PyQt6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QFileDialog,
    QFrame,
    QGraphicsDropShadowEffect,
    QGridLayout,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QSpinBox,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

DEFAULT_FILE = "출생아수__합계출산율__자연증가_등.xlsx"
DEFAULT_START, DEFAULT_END = 1970, 2025
MIN_YEARS = 5  # 이보다 짧은 기간은 추이 분석이 의미 없으므로 분석하지 않는다

# KOSIS 원본 항목명 -> 분석용 컬럼명
COLUMNS = {
    "출생아수(명)": "출생아수",
    "자연증가건수(명)": "자연증가",
    "조출생률(천명당)": "조출생률",
    "자연증가율(천명당)": "자연증가율",
    "합계출산율(명)": "합계출산율",
    "출생성비(명)": "출생성비",
}

UP_COLOR = "#22c55e"    # 증가
DOWN_COLOR = "#f43f5e"  # 감소
LINE_COLOR = "#38bdf8"
ACCENT = "#f59e0b"
CHART_BG = "#1e293b"
TEXT = "#e2e8f0"
MUTED = "#94a3b8"

# 그래프도 앱과 같은 어두운 톤으로
matplotlib.rcParams.update({
    "font.family": "Malgun Gothic",
    "axes.unicode_minus": False,
    "figure.facecolor": CHART_BG,
    "savefig.facecolor": CHART_BG,
    "axes.facecolor": CHART_BG,
    "axes.edgecolor": "#334155",
    "axes.labelcolor": TEXT,
    "axes.titlecolor": TEXT,
    "axes.titlesize": 13,
    "axes.titleweight": "bold",
    "axes.grid": True,
    "axes.axisbelow": True,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "grid.color": "#334155",
    "grid.alpha": 0.6,
    "text.color": TEXT,
    "xtick.color": MUTED,
    "ytick.color": MUTED,
    "legend.frameon": False,
})


def resource_path(name):
    # PyInstaller로 만든 exe에서는 함께 묶인 파일이 sys._MEIPASS 폴더에 풀린다
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


def man(value):
    """명 단위 숫자를 '25.4만' 처럼 만 명 단위로."""
    return f"{value / 10000:,.1f}만"


# ---------------------------------------------------------------- 1. 데이터 클렌징

def load_and_clean(path):
    """KOSIS wide 형식 엑셀을 읽어 연도 인덱스 DataFrame과 처리 기록을 돌려준다."""
    log = []
    # openpyxl의 'no default style' 경고는 KOSIS 파일에서 항상 나오므로 숨긴다
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        raw = pd.read_excel(path, sheet_name=0, header=None)
    log.append(f"원본: {raw.shape[0]}행 x {raw.shape[1]}열 (행=지표, 열=연도인 wide 형식)")

    # 첫 행은 연도 헤더, 첫 열은 지표명 -> 행/열을 바꿔 연도가 행이 되게 한다
    raw[0] = raw[0].astype(str).str.strip()
    raw = raw.set_index(0)
    df = raw.iloc[1:].T
    df.index = raw.iloc[0].values
    df.columns = [str(c).strip() for c in df.columns]

    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"필요한 항목이 없습니다: {', '.join(missing)}")
    df = df.rename(columns=COLUMNS)[list(COLUMNS.values())]
    log.append("구조 변환: 행/열 전치, 항목명 정리 (예: 출생아수(명) → 출생아수)")

    # 연도: 1970.0 같은 float -> int, 숫자가 아닌 연도(주석 등)는 제거
    years = pd.to_numeric(pd.Series(df.index), errors="coerce")
    before = len(df)
    df = df[years.notna().values]
    df.index = years.dropna().astype(int).values
    df.index.name = "연도"
    log.append(f"연도 정수 변환, 숫자가 아닌 연도 열 제거: {before - len(df)}건")

    # 값: 콤마/'-' 같은 문자열이 섞여도 숫자로 강제 변환
    for col in df.columns:
        df[col] = pd.to_numeric(df[col].astype(str).str.replace(",", "").str.strip(), errors="coerce")
    log.append("형 변환: 천 단위 콤마 제거 후 숫자로 변환")

    dup = df.index.duplicated().sum()
    df = df[~df.index.duplicated(keep="last")].sort_index()
    log.append(f"중복 연도 제거: {dup}건, 연도순 정렬")

    # 결측치: 연속 시계열이므로 앞뒤 연도로 선형보간
    na = int(df.isna().sum().sum())
    if na:
        df = df.interpolate(method="linear", limit_direction="both")
    log.append(f"결측치 선형보간: {na}건")

    gaps = sorted(set(range(df.index.min(), df.index.max() + 1)) - set(df.index))
    log.append(f"누락 연도: {', '.join(map(str, gaps)) if gaps else '없음'}")

    # 인원수는 정수, 비율은 float 오차 정리
    for col in ["출생아수", "자연증가"]:
        df[col] = df[col].round().astype("int64")
    for col in ["조출생률", "자연증가율", "출생성비"]:
        df[col] = df[col].round(1)
    df["합계출산율"] = df["합계출산율"].round(3)

    # 도메인 기준 범위 점검 (값은 바꾸지 않고 기록만)
    checks = {
        "출생아수 0 이하": (df["출생아수"] <= 0).sum(),
        "합계출산율 0~10 범위 밖": (~df["합계출산율"].between(0, 10)).sum(),
        "출생성비 90~130 범위 밖": (~df["출생성비"].between(90, 130)).sum(),
    }
    for label, count in checks.items():
        log.append(f"이상치 점검 - {label}: {count}건")

    # 파생 변수
    df["사망자수"] = df["출생아수"] - df["자연증가"]  # 자연증가 = 출생 - 사망
    df["전년대비"] = df["출생아수"].diff()
    df["증감률%"] = df["출생아수"].pct_change() * 100
    df["5년이동평균"] = df["출생아수"].rolling(5).mean()
    log.append("파생 변수 추가: 사망자수(출생-자연증가), 전년대비, 증감률%, 5년이동평균")

    log.append(f"정제 후: {len(df)}년 x {df.shape[1]}개 컬럼, {df.index.min()} ~ {df.index.max()}")
    return df, log


# ---------------------------------------------------------------- 2. 다각도 분석

def longest_decline(births):
    """출생아수가 연속으로 줄어든 가장 긴 구간 (시작, 끝, 연수)."""
    best, start = (None, None, 0), None
    prev = None
    for year, value in births.items():
        if prev is not None and value < prev:
            start = start or year
            length = year - start + 1
            if length > best[2]:
                best = (start, year, length)
        else:
            start = None
        prev = value
    return best


def analyze(df, start, end):
    """start~end 연도 구간을 분석한다. 전년대비·이동평균은 구간 첫해도 채워지도록 전체 데이터로 계산한다."""
    d = df.loc[start:end].copy()
    births, tfr = d["출생아수"], d["합계출산율"]
    n = end - start

    b0, b1 = births.iloc[0], births.iloc[-1]
    cagr = ((b1 / b0) ** (1 / n) - 1) * 100
    dec_start, dec_end, dec_len = longest_decline(births)

    low = births.idxmin()
    rebound = f"{low}년 저점 대비 {(b1 / births[low] - 1) * 100:+.1f}%" if low < end else "마지막 해가 최저점"
    abnormal = d[d["출생성비"] > 107]

    summary = pd.DataFrame([
        ("분석 기간", f"{start} ~ {end}년 ({len(d)}년)"),
        ("시작 / 마지막 출생아수", f"{b0:,}명 → {b1:,}명"),
        ("기간 증감률", f"{(b1 / b0 - 1) * 100:+.1f}%"),
        ("연평균 증감률", f"{cagr:+.2f}%"),
        ("누적 출생아수", f"{births.sum():,}명"),
        ("연평균 출생아수", f"{births.mean():,.0f}명"),
        ("최다 출생", f"{births.max():,}명  ({births.idxmax()}년)"),
        ("최소 출생", f"{births.min():,}명  ({low}년)"),
        ("최근 반등", rebound),
        ("최장 연속 감소", f"{dec_start}~{dec_end}년 ({dec_len}년 연속)" if dec_len else "없음"),
        ("합계출산율 최고 / 최저", f"{tfr.max():.3f}명 ({tfr.idxmax()}년) / {tfr.min():.3f}명 ({tfr.idxmin()}년)"),
        ("마지막 해 합계출산율", f"{tfr.iloc[-1]:.3f}명"),
        ("마지막 해 사망자수", f"{d['사망자수'].iloc[-1]:,}명"),
        ("마지막 해 자연증가", f"{d['자연증가'].iloc[-1]:+,}명"),
        ("출생성비 107 초과 연도", f"{len(abnormal)}년" + (f" ({abnormal.index.min()}~{abnormal.index.max()})" if len(abnormal) else "")),
        ("출생아수-합계출산율 상관계수", f"{births.corr(tfr):.3f}"),
    ], columns=["항목", "값"])

    rules = [
        ("대체출산율(2.1명) 미만 진입", tfr < 2.1, "합계출산율"),
        ("저출산(1.5명) 미만 진입", tfr < 1.5, "합계출산율"),
        ("초저출산(1.3명) 미만 진입", tfr < 1.3, "합계출산율"),
        ("합계출산율 1명 미만 진입", tfr < 1.0, "합계출산율"),
        ("출생아수 50만 명 미만", births < 500_000, "출생아수"),
        ("출생아수 30만 명 미만", births < 300_000, "출생아수"),
        ("자연감소 시작 (사망 > 출생)", d["자연증가"] < 0, "자연증가"),
    ]
    rows = []
    for label, mask, col in rules:
        years = d.index[mask]
        if len(years):
            year = years.min()
            value = d.loc[year, col]
            rows.append((label, f"{year}년", f"{value:.3f}명" if col == "합계출산율" else f"{value:,}명",
                         "예" if mask.loc[year:].all() else "아니오"))
        else:
            rows.append((label, "해당 없음", "-", "-"))
    milestones = pd.DataFrame(rows, columns=["임계점", "최초 연도", "그 해 값", "이후 계속 유지"])

    d["연대"] = (d.index // 10 * 10).astype(str) + "년대"
    decade = d.groupby("연대").agg(
        평균출생아수=("출생아수", "mean"),
        평균합계출산율=("합계출산율", "mean"),
        평균사망자수=("사망자수", "mean"),
        평균자연증가=("자연증가", "mean"),
        평균출생성비=("출생성비", "mean"),
        연수=("출생아수", "size"),
    ).reset_index()
    decade["직전연대대비%"] = decade["평균출생아수"].pct_change() * 100

    change = d["증감률%"].dropna()
    down, up = change.nsmallest(10), change.nlargest(10)
    extremes = pd.DataFrame({
        "순위": range(1, len(down) + 1),
        "감소 연도": down.index,
        "감소율%": down.values,
        "증가 연도": up.index,
        "증가율%": up.values,
    })

    cols = ["출생아수", "사망자수", "자연증가", "조출생률", "합계출산율", "출생성비"]
    corr = d[cols].corr().reset_index().rename(columns={"index": "지표"})

    return {
        "data": d, "growth": (b1 / b0 - 1) * 100,
        "summary": summary, "milestones": milestones, "decade": decade,
        "extremes": extremes, "corr": corr,
    }


# ---------------------------------------------------------------- 3. 그래프

def man_axis(ax):
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v / 10000:,.0f}만"))


def year_axis(ax, years):
    step = 5 if len(years) > 20 else (2 if len(years) > 10 else 1)
    first = years[0] - years[0] % step if step > 1 else years[0]
    ax.set_xticks([y for y in range(first, years[-1] + 1, step) if y >= years[0]])
    ax.set_xlim(years[0] - 1, years[-1] + 1)


def draw_births(fig, d):
    """요청 그래프: 연도별 출생아수 라인 그래프 (기본 1970 ~ 2025년)."""
    fig.clear()
    ax = fig.subplots()
    births = d["출생아수"]
    ax.plot(births.index, births, color=LINE_COLOR, linewidth=2.2, marker="o", markersize=3.5, label="출생아수")
    ax.plot(d.index, d["5년이동평균"], color=ACCENT, linewidth=1.2, linestyle="--", label="5년 이동평균")
    ax.fill_between(births.index, births, 0, color=LINE_COLOR, alpha=0.10)

    marks = {"최고": (births.idxmax(), UP_COLOR, 14), "최저": (births.idxmin(), DOWN_COLOR, -34)}
    if births.index[-1] not in (births.idxmax(), births.idxmin()):
        marks["최근"] = (births.index[-1], LINE_COLOR, 14)
    for label, (year, color, dy) in marks.items():
        ax.scatter([year], [births[year]], color=color, zorder=3, s=45)
        ax.annotate(f"{label} {year}년\n{births[year]:,}명", (year, births[year]),
                    xytext=(0, dy), textcoords="offset points", ha="center", fontsize=9, color=color)

    ax.set_title(f"대한민국 출생아수 추이 ({births.index[0]} ~ {births.index[-1]})")
    ax.set_xlabel("연도")
    ax.set_ylabel("출생아수 (명)")
    ax.set_ylim(0, births.max() * 1.15)
    man_axis(ax)
    year_axis(ax, list(d.index))
    ax.legend(loc="upper right")
    return ax


def draw_vital(fig, d):
    fig.clear()
    ax, ax_nat = fig.subplots(2, 1, sharex=True, height_ratios=[3, 2])
    ax.plot(d.index, d["출생아수"], color=LINE_COLOR, linewidth=2, label="출생아수")
    ax.plot(d.index, d["사망자수"], color=DOWN_COLOR, linewidth=2, label="사망자수")
    cross = d.index[d["자연증가"] < 0]
    if len(cross):
        ax.axvline(cross.min(), color=MUTED, linewidth=0.8, linestyle=":")
        ax.annotate(f"{cross.min()}년 데드크로스", (cross.min(), d["출생아수"].max()),
                    xytext=(-6, 0), textcoords="offset points", ha="right", va="top", fontsize=9, color=MUTED)
    ax.set_title("출생아수와 사망자수")
    man_axis(ax)
    ax.legend(loc="upper right")
    nat = d["자연증가"]
    ax_nat.bar(d.index, nat, color=[UP_COLOR if v >= 0 else DOWN_COLOR for v in nat])
    ax_nat.axhline(0, color=MUTED, linewidth=0.8)
    ax_nat.set_title("자연증가 (출생 - 사망)")
    man_axis(ax_nat)
    year_axis(ax_nat, list(d.index))


def draw_fertility(fig, d):
    fig.clear()
    ax, ax_cbr = fig.subplots(2, 1, sharex=True, height_ratios=[3, 2])
    tfr = d["합계출산율"]
    ax.plot(d.index, tfr, color="#a78bfa", linewidth=2.2, marker="o", markersize=3)
    for level, label in ((2.1, "대체출산율 2.1"), (1.3, "초저출산 1.3"), (1.0, "1.0")):
        if tfr.min() < level * 1.3 and tfr.max() > level * 0.7:
            ax.axhline(level, color=ACCENT, linewidth=0.8, linestyle="--")
            ax.annotate(label, (d.index[-1], level), xytext=(0, 4), textcoords="offset points",
                        ha="right", fontsize=8, color=ACCENT)
    ax.annotate(f"{tfr.iloc[-1]:.3f}", (d.index[-1], tfr.iloc[-1]), xytext=(6, 0),
                textcoords="offset points", va="center", fontsize=9, color="#a78bfa")
    ax.set_title("합계출산율 (여성 1명이 평생 낳을 것으로 예상되는 자녀 수)")
    ax.set_ylim(bottom=0)
    ax_cbr.plot(d.index, d["조출생률"], color=LINE_COLOR, linewidth=1.8, label="조출생률")
    ax_cbr.plot(d.index, d["자연증가율"], color=UP_COLOR, linewidth=1.8, label="자연증가율")
    ax_cbr.axhline(0, color=MUTED, linewidth=0.8)
    ax_cbr.set_title("인구 천 명당 출생 / 자연증가")
    ax_cbr.legend(loc="upper right")
    year_axis(ax_cbr, list(d.index))


def draw_decade(fig, decade):
    fig.clear()
    ax = fig.subplots()
    bars = ax.bar(decade["연대"], decade["평균출생아수"], color=LINE_COLOR, alpha=0.85)
    ax.bar_label(bars, labels=[man(v) for v in decade["평균출생아수"]], fontsize=9, color=TEXT, padding=3)
    man_axis(ax)
    ax.set_ylim(0, decade["평균출생아수"].max() * 1.15)
    ax.set_title("연대별 평균 출생아수와 합계출산율")
    ax2 = ax.twinx()
    ax2.plot(decade["연대"], decade["평균합계출산율"], color=ACCENT, marker="o", linewidth=2)
    for x, v in zip(decade["연대"], decade["평균합계출산율"]):
        ax2.annotate(f"{v:.2f}", (x, v), xytext=(0, 8), textcoords="offset points",
                     ha="center", fontsize=9, color=ACCENT)
    ax2.set_ylim(0, decade["평균합계출산율"].max() * 1.3)
    ax2.set_ylabel("평균 합계출산율 (명)", color=ACCENT)
    ax2.tick_params(axis="y", colors=ACCENT)
    ax2.grid(False)
    ax2.spines["right"].set_visible(True)


def draw_change(fig, d):
    fig.clear()
    ax, ax_sex = fig.subplots(2, 1, sharex=True)
    change = d["증감률%"]
    ax.bar(d.index, change, color=[UP_COLOR if v >= 0 else DOWN_COLOR for v in change.fillna(0)])
    ax.axhline(0, color=MUTED, linewidth=0.8)
    ax.set_title("출생아수 전년 대비 증감률 (%)")
    sex = d["출생성비"]
    ax_sex.axhspan(103, 107, color=UP_COLOR, alpha=0.12, label="정상 범위 103~107")
    ax_sex.plot(d.index, sex, color=DOWN_COLOR, linewidth=1.8, marker="o", markersize=3, label="출생성비")
    ax_sex.set_title("출생성비 (여아 100명당 남아)")
    ax_sex.legend(loc="upper right")
    year_axis(ax_sex, list(d.index))


# ---------------------------------------------------------------- 4. GUI

STYLE = """
QMainWindow, QWidget#central {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #0f172a, stop:1 #1e1b4b);
}
QWidget { color: #e2e8f0; font-family: 'Malgun Gothic'; font-size: 10pt; }

QFrame#header {
    border-radius: 16px;
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
        stop:0 #db2777, stop:0.5 #7c3aed, stop:1 #2563eb);
}
QLabel#title { color: white; font-size: 20pt; font-weight: 800; background: transparent; }
QLabel#subtitle { color: rgba(255,255,255,0.85); font-size: 10pt; background: transparent; }

QFrame#quote { border-radius: 12px; background: rgba(15, 23, 42, 0.55); }
QLabel#price { color: white; font-size: 22pt; font-weight: 800; background: transparent; }
QLabel#change { font-size: 12pt; font-weight: 700; background: transparent; }
QLabel#quoteMeta { color: rgba(255,255,255,0.75); font-size: 9pt; background: transparent; }

QFrame#card {
    background: rgba(30, 41, 59, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 14px;
}
QLabel#cardTitle { color: #94a3b8; font-weight: 700; background: transparent; }
QLabel#muted { color: #94a3b8; background: transparent; }
QLabel#hover { color: #38bdf8; font-weight: 700; background: transparent; }

QSpinBox {
    background: #0f172a; border: 2px solid #334155; border-radius: 10px;
    padding: 6px 10px; font-size: 10pt; color: #f8fafc;
}
QSpinBox:focus { border: 2px solid #a78bfa; }

QPushButton {
    border: none; border-radius: 10px; padding: 9px 18px;
    font-weight: 700; color: white; background: #334155;
}
QPushButton:hover { background: #475569; }
QPushButton:disabled { background: #1e293b; color: #475569; }
QPushButton#primary {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #7c3aed, stop:1 #2563eb);
}
QPushButton#primary:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #8b5cf6, stop:1 #3b82f6);
}
QPushButton#primary:disabled { background: #1e293b; color: #475569; }

QTabWidget::pane { border: none; }
QTabBar::tab {
    background: transparent; color: #94a3b8; font-weight: 700;
    padding: 8px 16px; border-bottom: 2px solid transparent;
}
QTabBar::tab:selected { color: #f8fafc; border-bottom: 2px solid #a78bfa; }
QTabBar::tab:hover { color: #e2e8f0; }

QTableWidget {
    background: transparent; alternate-background-color: rgba(51, 65, 85, 0.35);
    border: none; gridline-color: transparent;
    selection-background-color: rgba(124, 58, 237, 0.35); selection-color: white;
}
QTableWidget::item { padding: 4px 8px; border-bottom: 1px solid rgba(148,163,184,0.08); }
QHeaderView, QTableCornerButton::section { background: #1e293b; border: none; }
QHeaderView::section {
    background: #1e293b; color: #94a3b8; font-weight: 700;
    border: none; border-bottom: 2px solid #a78bfa; padding: 8px;
}

QPlainTextEdit {
    background: #0f172a; border: none; border-radius: 10px; padding: 10px;
    font-family: 'Consolas', 'Malgun Gothic'; font-size: 10pt;
}
QSplitter::handle { background: transparent; }

QScrollBar:vertical { background: transparent; width: 10px; margin: 2px; }
QScrollBar::handle:vertical { background: #475569; border-radius: 4px; min-height: 30px; }
QScrollBar::handle:vertical:hover { background: #a78bfa; }
QScrollBar:horizontal { background: transparent; height: 10px; margin: 2px; }
QScrollBar::handle:horizontal { background: #475569; border-radius: 4px; min-width: 30px; }
QScrollBar::add-line, QScrollBar::sub-line { height: 0; width: 0; }
QScrollBar::add-page, QScrollBar::sub-page { background: none; }

QStatusBar { background: transparent; color: #94a3b8; }
QMessageBox, QFileDialog { background: #1e293b; }
"""


class Chart(FigureCanvasQTAgg):
    def __init__(self):
        self.figure = Figure(figsize=(8, 5), layout="constrained")
        super().__init__(self.figure)


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("대한민국 출생 통계 분석")
        self.resize(1280, 880)
        self.setStyleSheet(STYLE)
        self.setAcceptDrops(True)
        self.df = None
        self.view = None

        # 상단 배너: 제목 + 마지막 해 출생아수 요약
        header_frame = QFrame(objectName="header")
        titles = QVBoxLayout()
        titles.addWidget(QLabel("👶  대한민국 출생 통계 분석", objectName="title"))
        titles.addWidget(QLabel("KOSIS 출생아수·합계출산율·자연증가 엑셀을 정제하고 다각도로 분석합니다",
                                objectName="subtitle"))

        quote_frame = QFrame(objectName="quote")
        self.births_label = QLabel("-", objectName="price")
        self.change_label = QLabel("", objectName="change")
        self.quote_meta = QLabel("엑셀 파일을 열어 주세요", objectName="quoteMeta")
        births_row = QHBoxLayout()
        births_row.addWidget(self.births_label)
        births_row.addSpacing(10)
        births_row.addWidget(self.change_label, 0, Qt.AlignmentFlag.AlignBottom)
        quote_box = QVBoxLayout(quote_frame)
        quote_box.setContentsMargins(18, 10, 18, 10)
        quote_box.addLayout(births_row)
        quote_box.addWidget(self.quote_meta)

        banner = QHBoxLayout(header_frame)
        banner.setContentsMargins(24, 18, 24, 18)
        banner.addLayout(titles, 1)
        banner.addWidget(quote_frame, 0, Qt.AlignmentFlag.AlignVCenter)

        # 파일 / 기간 / 저장
        self.open_btn = QPushButton("📂  엑셀 열기")
        self.open_btn.clicked.connect(self.choose_file)
        self.file_label = QLabel("파일 없음", objectName="muted")
        self.start_spin = self.make_year_spin()
        self.end_spin = self.make_year_spin()
        self.full_btn = QPushButton("전체 기간")
        self.full_btn.clicked.connect(self.select_full_range)
        self.run_btn = QPushButton("🔄  분석", objectName="primary")
        self.run_btn.clicked.connect(self.run_analysis)
        self.save_btn = QPushButton("💾  그래프 저장")
        self.save_btn.clicked.connect(self.save_charts)
        self.export_btn = QPushButton("📄  정제 데이터 저장")
        self.export_btn.clicked.connect(self.export_csv)
        for btn in (self.open_btn, self.full_btn, self.run_btn, self.save_btn, self.export_btn):
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.data_widgets = (self.start_spin, self.end_spin, self.full_btn, self.run_btn,
                             self.save_btn, self.export_btn)
        for widget in self.data_widgets:
            widget.setEnabled(False)

        control_card = self.make_card()
        top = QHBoxLayout(control_card)
        top.setContentsMargins(16, 14, 16, 14)
        top.addWidget(self.open_btn)
        top.addWidget(self.file_label, 1)
        top.addWidget(QLabel("분석 기간"))
        top.addWidget(self.start_spin)
        top.addWidget(QLabel("~"))
        top.addWidget(self.end_spin)
        top.addWidget(self.full_btn)
        top.addWidget(self.run_btn)
        top.addSpacing(12)
        top.addWidget(self.save_btn)
        top.addWidget(self.export_btn)

        # 결과 탭
        self.births_chart = Chart()
        self.vital_chart = Chart()
        self.fertility_chart = Chart()
        self.decade_chart = Chart()
        self.change_chart = Chart()
        self.charts = {
            "01_births": self.births_chart,
            "02_births_deaths": self.vital_chart,
            "03_fertility_rate": self.fertility_chart,
            "04_decade": self.decade_chart,
            "05_change_sex_ratio": self.change_chart,
        }

        self.hover_label = QLabel("그래프 위에 마우스를 올리면 연도별 출생아수가 표시됩니다", objectName="hover")
        births_tab = QWidget()
        births_box = QVBoxLayout(births_tab)
        births_box.setContentsMargins(0, 8, 0, 0)
        births_box.addWidget(self.hover_label)
        births_box.addWidget(self.births_chart, 1)
        self.births_chart.mpl_connect("motion_notify_event", self.on_births_hover)

        self.summary_table = self.make_table()
        self.milestone_table = self.make_table()
        self.extreme_table = self.make_table()
        summary_tab = QWidget()
        grid = QGridLayout(summary_tab)
        grid.setContentsMargins(0, 8, 0, 0)
        grid.addWidget(QLabel("핵심 지표", objectName="cardTitle"), 0, 0)
        grid.addWidget(self.summary_table, 1, 0, 3, 1)
        grid.addWidget(QLabel("저출산 임계점", objectName="cardTitle"), 0, 1)
        grid.addWidget(self.milestone_table, 1, 1)
        grid.addWidget(QLabel("출생아수 전년 대비 감소 / 증가 Top 10", objectName="cardTitle"), 2, 1)
        grid.addWidget(self.extreme_table, 3, 1)
        grid.setColumnStretch(0, 5)
        grid.setColumnStretch(1, 6)
        # 임계점 표는 7행이 모두 보이도록 높이를 고정하고 나머지는 Top 10 표에 준다
        self.milestone_table.setFixedHeight(7 * 30 + 44)
        grid.setRowStretch(3, 1)

        self.decade_table = self.make_table()
        # 열이 8개라 늘려 맞추면 머리글이 잘리므로 내용 폭에 맞추고 넘치면 가로 스크롤
        self.decade_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.corr_table = self.make_table()
        corr_tab = QWidget()
        corr_box = QVBoxLayout(corr_tab)
        corr_box.setContentsMargins(0, 8, 0, 0)
        corr_box.addWidget(QLabel("지표 간 피어슨 상관계수 (1에 가까울수록 같이 움직임, -1이면 반대로 움직임)",
                                  objectName="cardTitle"))
        corr_box.addWidget(self.corr_table, 1)

        self.data_table = self.make_table()
        self.data_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.log_text = QPlainTextEdit(readOnly=True)
        self.log_text.setLineWrapMode(QPlainTextEdit.LineWrapMode.NoWrap)
        clean_tab = QSplitter(Qt.Orientation.Horizontal)
        clean_tab.addWidget(self.log_text)
        clean_tab.addWidget(self.data_table)
        clean_tab.setSizes([460, 740])

        self.tabs = QTabWidget()
        self.tabs.addTab(births_tab, "📈  출생아수 추이")
        self.tabs.addTab(summary_tab, "📋  요약 지표")
        self.tabs.addTab(self.split(self.decade_table, self.decade_chart), "📅  연대별")
        self.tabs.addTab(self.vital_chart, "⚖  출생·사망")
        self.tabs.addTab(self.fertility_chart, "👩  합계출산율")
        self.tabs.addTab(self.change_chart, "📊  증감률·출생성비")
        self.tabs.addTab(corr_tab, "🔗  상관관계")
        self.tabs.addTab(clean_tab, "🧹  데이터 클렌징")
        result_card = self.make_card()
        box = QVBoxLayout(result_card)
        box.setContentsMargins(16, 8, 16, 12)
        box.addWidget(self.tabs)

        self.statusBar().showMessage("준비 - 엑셀 파일을 열거나 창에 끌어다 놓으세요")

        layout = QVBoxLayout()
        layout.setContentsMargins(18, 18, 18, 6)
        layout.setSpacing(14)
        layout.addWidget(header_frame)
        layout.addWidget(control_card)
        layout.addWidget(result_card, 1)
        container = QWidget(objectName="central")
        container.setLayout(layout)
        self.setCentralWidget(container)

    # --- 디자인 도우미

    @staticmethod
    def make_card():
        card = QFrame(objectName="card")
        shadow = QGraphicsDropShadowEffect(blurRadius=24, xOffset=0, yOffset=6)
        shadow.setColor(QColor(0, 0, 0, 120))
        card.setGraphicsEffect(shadow)
        return card

    @staticmethod
    def make_year_spin():
        spin = QSpinBox()
        spin.setSuffix("년")
        spin.setMinimumWidth(96)
        return spin

    @staticmethod
    def make_table():
        table = QTableWidget()
        table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        table.setAlternatingRowColors(True)
        table.setShowGrid(False)
        table.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        table.verticalHeader().setVisible(False)
        table.verticalHeader().setDefaultSectionSize(30)
        table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        return table

    @staticmethod
    def split(table, chart):
        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.addWidget(table)
        splitter.addWidget(chart)
        splitter.setSizes([560, 640])
        return splitter

    @staticmethod
    def fill_table(table, frame, formats=None, signed=()):
        """DataFrame을 표에 채운다. formats는 열별 포맷 문자열, signed에 든 열은 부호에 따라 증가/감소 색을 칠한다."""
        formats = formats or {}
        table.setRowCount(len(frame))
        table.setColumnCount(len(frame.columns))
        table.setHorizontalHeaderLabels([str(c) for c in frame.columns])
        for r, row in enumerate(frame.itertuples(index=False)):
            for c, value in enumerate(row):
                col = frame.columns[c]
                if pd.isna(value):
                    text = "-"
                elif col in formats:
                    text = formats[col].format(value)
                elif isinstance(value, (int, np.integer)):
                    text = f"{value:,}" if "연도" not in col else str(value)
                elif isinstance(value, (float, np.floating)):
                    text = f"{value:,.2f}"
                else:
                    text = str(value)
                item = QTableWidgetItem(text)
                if isinstance(value, (int, float, np.number)):
                    item.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
                if col in signed and pd.notna(value) and value != 0:
                    item.setForeground(QColor(UP_COLOR if value > 0 else DOWN_COLOR))
                table.setItem(r, c, item)

    # --- 파일 불러오기

    def choose_file(self):
        path, _ = QFileDialog.getOpenFileName(self, "출생 통계 엑셀 열기", "", "엑셀 파일 (*.xlsx *.xls)")
        if path:
            self.load_file(path)

    def dragEnterEvent(self, event):
        urls = event.mimeData().urls()
        if urls and urls[0].toLocalFile().lower().endswith((".xlsx", ".xls")):
            event.acceptProposedAction()

    def dropEvent(self, event):
        self.load_file(event.mimeData().urls()[0].toLocalFile())

    def load_file(self, path):
        try:
            df, log = load_and_clean(path)
        except (OSError, ValueError, KeyError, IndexError) as e:
            QMessageBox.warning(self, "오류", f"파일을 불러오지 못했습니다.\n{e}")
            return
        if len(df) < MIN_YEARS:
            QMessageBox.warning(self, "오류", f"정제 후 데이터가 {len(df)}년뿐이라 분석할 수 없습니다.")
            return
        self.df = df
        self.file_label.setText(os.path.basename(path))
        self.file_label.setToolTip(path)
        self.log_text.setPlainText("\n".join(log))
        cols = ["출생아수", "사망자수", "자연증가", "증감률%", "조출생률", "자연증가율", "합계출산율", "출생성비"]
        self.fill_table(self.data_table, df[cols].sort_index(ascending=False).reset_index(),
                        formats={"자연증가": "{:+,}", "증감률%": "{:+.2f}", "조출생률": "{:.1f}",
                                 "자연증가율": "{:+.1f}", "합계출산율": "{:.3f}", "출생성비": "{:.1f}"},
                        signed=("자연증가", "증감률%"))

        first, last = int(df.index.min()), int(df.index.max())
        for spin in (self.start_spin, self.end_spin):
            spin.setRange(first, last)
        # 기본 분석 기간: 1970 ~ 2025년 (데이터 범위 안으로)
        start, end = max(first, DEFAULT_START), min(last, DEFAULT_END)
        if end - start + 1 < MIN_YEARS:
            start, end = first, last
        self.start_spin.setValue(start)
        self.end_spin.setValue(end)
        for widget in self.data_widgets:
            widget.setEnabled(True)
        self.run_analysis()

    def select_full_range(self):
        self.start_spin.setValue(int(self.df.index.min()))
        self.end_spin.setValue(int(self.df.index.max()))
        self.run_analysis()

    # --- 분석 / 표시

    def run_analysis(self):
        if self.df is None:
            return
        start, end = self.start_spin.value(), self.end_spin.value()
        if end - start + 1 < MIN_YEARS:
            QMessageBox.warning(self, "기간 확인", f"분석 기간은 {MIN_YEARS}년 이상이어야 합니다. (현재 {max(end - start + 1, 0)}년)")
            return

        res = analyze(self.df, start, end)
        d = res["data"]
        last = d.iloc[-1]

        self.births_label.setText(f"{last['출생아수']:,.0f}명")
        self.change_label.setText(f"{'▲' if res['growth'] >= 0 else '▼'} {abs(res['growth']):.1f}%")
        self.change_label.setStyleSheet(f"color: {UP_COLOR if res['growth'] >= 0 else DOWN_COLOR};")
        self.quote_meta.setText(
            f"{end}년 출생아수 · {start}년 대비\n"
            f"합계출산율 {last['합계출산율']:.3f}명  ·  자연증가 {last['자연증가']:+,.0f}명"
        )

        self.fill_table(self.summary_table, res["summary"])
        self.summary_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.fill_table(self.milestone_table, res["milestones"])
        self.milestone_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.fill_table(self.extreme_table, res["extremes"], formats={"감소율%": "{:+.2f}", "증가율%": "{:+.2f}"},
                        signed=("감소율%", "증가율%"))
        self.fill_table(self.decade_table, res["decade"],
                        formats={"평균출생아수": "{:,.0f}", "평균합계출산율": "{:.3f}", "평균사망자수": "{:,.0f}",
                                 "평균자연증가": "{:+,.0f}", "평균출생성비": "{:.1f}", "직전연대대비%": "{:+.1f}"},
                        signed=("평균자연증가", "직전연대대비%"))
        corr = res["corr"]
        self.fill_table(self.corr_table, corr, formats={c: "{:+.3f}" for c in corr.columns[1:]},
                        signed=tuple(corr.columns[1:]))

        self.view = d
        births_ax = draw_births(self.births_chart.figure, d)
        self.hover_line = births_ax.axvline(d.index[0], color=MUTED, linewidth=0.8, visible=False)
        (self.hover_dot,) = births_ax.plot([], [], "o", color="white", markersize=7)
        draw_vital(self.vital_chart.figure, d)
        draw_fertility(self.fertility_chart.figure, d)
        draw_decade(self.decade_chart.figure, res["decade"])
        draw_change(self.change_chart.figure, d)
        for chart in self.charts.values():
            chart.draw_idle()

        self.statusBar().showMessage(f"분석 완료: {start} ~ {end}년, {len(d)}년치")

    def on_births_hover(self, event):
        d = self.view
        if d is None or event.inaxes is None or event.xdata is None:
            return
        year = int(min(max(round(event.xdata), d.index[0]), d.index[-1]))
        row = d.loc[year]
        change = "-" if pd.isna(row["증감률%"]) else f"{row['전년대비']:+,.0f}명 ({row['증감률%']:+.2f}%)"
        self.hover_label.setText(f"{year}년   출생아수 {row['출생아수']:,.0f}명   전년 대비 {change}   "
                                 f"합계출산율 {row['합계출산율']:.3f}명")
        self.hover_line.set_xdata([year, year])
        self.hover_line.set_visible(True)
        self.hover_dot.set_data([year], [row["출생아수"]])
        self.births_chart.draw_idle()

    def save_charts(self):
        folder = QFileDialog.getExistingDirectory(self, "그래프 저장 폴더 선택")
        if not folder:
            return
        try:
            for name, chart in self.charts.items():
                chart.figure.savefig(os.path.join(folder, f"{name}.png"), dpi=150)
        except OSError as e:
            QMessageBox.warning(self, "오류", f"저장하지 못했습니다.\n{e}")
            return
        self.statusBar().showMessage(f"{folder}에 그래프 {len(self.charts)}개를 저장했습니다.")

    def export_csv(self):
        path, _ = QFileDialog.getSaveFileName(self, "정제 데이터 저장", "births_clean.csv", "CSV 파일 (*.csv)")
        if not path:
            return
        try:
            self.df.to_csv(path, encoding="utf-8-sig")  # 엑셀에서 한글이 깨지지 않도록 BOM 포함
        except OSError as e:
            QMessageBox.warning(self, "오류", f"저장하지 못했습니다.\n{e}")
            return
        self.statusBar().showMessage(f"정제 데이터를 저장했습니다: {path}")


def find_default_file():
    # exe로 실행하면 __file__은 임시 폴더를 가리키므로 exe가 있는 폴더도 찾아본다
    app_dir = os.path.dirname(sys.executable if getattr(sys, "frozen", False) else os.path.abspath(__file__))
    for folder in (os.getcwd(), app_dir):
        path = os.path.join(folder, DEFAULT_FILE)
        if os.path.exists(path):
            return path
    return None


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle("Fusion")  # 스타일시트가 OS 기본 테마와 섞이지 않도록 Fusion 사용
    app.setWindowIcon(QIcon(resource_path("app_icon.ico")))
    window = MainWindow()
    window.show()
    path = sys.argv[1] if len(sys.argv) > 1 else find_default_file()
    if path:
        window.load_file(path)
    sys.exit(app.exec())
