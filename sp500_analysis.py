"""S&P 500 과거 데이터를 정제하고 다각도로 분석하는 GUI 앱 (PyQt6).

사용법:
    pip install PyQt6 pandas matplotlib
    python sp500_analysis.py ["S&P 500 과거 데이터.csv"]

CSV는 'CSV 열기' 버튼으로 고르거나 창에 끌어다 놓아도 불러온다.
"""

import os
import sys

import matplotlib
import matplotlib.dates as mdates
import numpy as np
import pandas as pd
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg
from matplotlib.figure import Figure
from matplotlib.ticker import FuncFormatter
from PyQt6.QtCore import QDate, Qt
from PyQt6.QtGui import QColor, QIcon
from PyQt6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QDateEdit,
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
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

DEFAULT_CSV = "S&P 500 과거 데이터.csv"
DEFAULT_START = pd.Timestamp("2000-01-01")
DEFAULT_END = pd.Timestamp("2019-12-31")
MIN_ROWS = 30  # 이보다 짧은 기간은 통계가 의미 없으므로 분석하지 않는다

COLUMNS = {
    "날짜": "date",
    "종가": "close",
    "시가": "open",
    "고가": "high",
    "저가": "low",
    "거래량": "volume",
    "변동 %": "change_pct",
}

UP_COLOR = "#22c55e"    # 미국 증시 관례: 상승은 초록
DOWN_COLOR = "#f43f5e"  # 하락은 빨강
LINE_COLOR = "#38bdf8"
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


def pct(value, digits=2):
    return "-" if pd.isna(value) else f"{value:.{digits}%}"


# ---------------------------------------------------------------- 1. 데이터 클렌징

def load_and_clean(path):
    """CSV를 읽어 정제한 DataFrame(날짜 인덱스, 시간순)과 처리 기록을 돌려준다."""
    log = []
    raw = pd.read_csv(path, encoding="utf-8-sig", dtype=str)
    log.append(f"원본: {raw.shape[0]:,}행 x {raw.shape[1]}열")

    missing = [c for c in COLUMNS if c not in raw.columns]
    if missing:
        raise ValueError(f"필요한 컬럼이 없습니다: {', '.join(missing)}")
    df = raw.rename(columns=COLUMNS)[list(COLUMNS.values())]

    # 날짜: "2019- 11- 14" 처럼 공백이 섞여 있음
    df["date"] = pd.to_datetime(df["date"].str.replace(" ", ""), format="%Y-%m-%d", errors="coerce")

    # 가격: "3,096.60" 처럼 천 단위 콤마가 있는 문자열
    for col in ["close", "open", "high", "low"]:
        df[col] = pd.to_numeric(df[col].str.replace(",", ""), errors="coerce")

    # 변동률: "-0.20%" -> -0.20
    df["change_pct"] = pd.to_numeric(df["change_pct"].str.rstrip("%"), errors="coerce")
    log.append("형 변환: 날짜 공백 제거, 가격 콤마 제거, 변동률 % 제거")

    if df["volume"].isna().all():
        df = df.drop(columns="volume")
        log.append("거래량 컬럼: 전부 비어 있어 제거")

    before = len(df)
    df = df.dropna(subset=["date", "close"])
    log.append(f"날짜/종가 결측 행 제거: {before - len(df)}건")

    before = len(df)
    df = df.drop_duplicates(subset="date")
    log.append(f"중복 날짜 제거: {before - len(df)}건")

    before = len(df)
    df = df[(df[["open", "high", "low", "close"]] > 0).all(axis=1)]
    log.append(f"0 이하 가격 행 제거: {before - len(df)}건")

    # OHLC 논리 검증: 고가 >= max(시가, 종가), 저가 <= min(시가, 종가)
    # 종가는 정상이므로 행을 지우지 않고 고가/저가를 보정 (예: 2001-10-17 시가 > 고가)
    oc_max = df[["open", "close"]].max(axis=1)
    oc_min = df[["open", "close"]].min(axis=1)
    bad = (df["high"] < oc_max) | (df["low"] > oc_min)
    log.append(f"OHLC 논리 오류 보정: {bad.sum()}건")
    for _, row in df[bad].iterrows():
        log.append(f"    {row['date']:%Y-%m-%d}  시 {row['open']:,.1f} 고 {row['high']:,.1f}"
                   f" 저 {row['low']:,.1f} 종 {row['close']:,.1f}")
    df["high"] = df["high"].where(df["high"] >= oc_max, oc_max)
    df["low"] = df["low"].where(df["low"] <= oc_min, oc_min)

    # 원본은 최신순 -> 시간순 정렬 후 날짜를 인덱스로
    df = df.sort_values("date").set_index("date")

    # 제공된 변동률과 종가로 계산한 변동률 비교
    diff = (df["close"].pct_change() * 100 - df["change_pct"]).abs()
    log.append(f"검증 - 계산 변동률과 원본 변동률 불일치(0.05%p 초과): {(diff > 0.05).sum()}건")

    log.append(f"정제 후: {len(df):,}행, {df.index.min():%Y-%m-%d} ~ {df.index.max():%Y-%m-%d}")
    return df, log


# ---------------------------------------------------------------- 2. 다각도 분석

def analyze(df, start, end):
    """start~end 구간을 분석한다. 이동평균은 구간 앞부분도 채워지도록 전체 데이터로 계산한다."""
    close = df.loc[start:end, "close"]
    ret = close.pct_change().dropna()
    ma50 = df["close"].rolling(50).mean().loc[start:end]
    ma200 = df["close"].rolling(200).mean().loc[start:end]

    years = (close.index[-1] - close.index[0]).days / 365.25
    total = close.iloc[-1] / close.iloc[0] - 1
    cagr = (1 + total) ** (1 / years) - 1 if years > 0 else np.nan
    vol = ret.std() * np.sqrt(252)

    drawdown = close / close.cummax() - 1
    trough = drawdown.idxmin()
    peak_date = close[:trough].idxmax()
    after = close[trough:]
    recovered = after[after >= close[peak_date]]
    if drawdown.min() == 0:
        mdd_range, recovery = "-", "-"
    else:
        mdd_range = f"{peak_date:%Y-%m-%d} → {trough:%Y-%m-%d}"
        recovery = f"{recovered.index[0]:%Y-%m-%d}" if len(recovered) else "미회복"

    cross = (ma50 > ma200).astype(int).diff()[ma200.notna()]
    above_200 = (close > ma200)[ma200.notna()].mean() if ma200.notna().any() else np.nan

    summary = pd.DataFrame([
        ("분석 기간", f"{close.index[0]:%Y-%m-%d} ~ {close.index[-1]:%Y-%m-%d}"),
        ("거래일 수", f"{len(close):,}일"),
        ("시작 종가", f"{close.iloc[0]:,.2f}"),
        ("마지막 종가", f"{close.iloc[-1]:,.2f}"),
        ("누적 수익률", pct(total)),
        ("연평균 수익률 (CAGR)", pct(cagr)),
        ("연환산 변동성", pct(vol)),
        ("샤프지수 (무위험수익률 0)", f"{ret.mean() * 252 / vol:.2f}"),
        ("최고 종가", f"{close.max():,.2f}  ({close.idxmax():%Y-%m-%d})"),
        ("최저 종가", f"{close.min():,.2f}  ({close.idxmin():%Y-%m-%d})"),
        ("최대 낙폭 (MDD)", pct(drawdown.min())),
        ("MDD 고점 → 저점", mdd_range),
        ("MDD 회복일", recovery),
        ("상승일 비율", pct((ret > 0).mean())),
        ("일간 수익률 평균 / 표준편차", f"{pct(ret.mean(), 4)} / {pct(ret.std(), 4)}"),
        ("왜도 / 첨도 (정규분포 0 / 0)", f"{ret.skew():.3f} / {ret.kurt():.3f}"),
        ("±3σ 초과 일수 (정규분포 기대치)",
         f"{(ret.abs() > 3 * ret.std()).sum()}일  (약 {len(ret) * 0.0027:.0f}일)"),
        ("골든크로스 / 데드크로스 (50·200일)", f"{(cross == 1).sum()}회 / {(cross == -1).sum()}회"),
        ("200일선 위에 있던 비율", pct(above_200)),
    ], columns=["항목", "값"])

    by_year = close.resample("YE")
    yearly = pd.DataFrame({
        "연도": by_year.last().index.year,
        "시작": by_year.first().values,
        "종가": by_year.last().values,
        "수익률%": by_year.last().pct_change().values * 100,
        "변동성%": (ret.resample("YE").std() * np.sqrt(252) * 100).reindex(by_year.last().index).values,
        "거래일": by_year.count().values,
    })
    # 첫 해는 전년도 종가가 없으므로 해당 연도 첫 종가 기준
    yearly.loc[0, "수익률%"] = (yearly.loc[0, "종가"] / yearly.loc[0, "시작"] - 1) * 100

    monthly_ret = close.resample("ME").last().pct_change().dropna() * 100
    grouped = monthly_ret.groupby(monthly_ret.index.month)
    seasonal = pd.DataFrame({
        "월": [f"{m}월" for m in grouped.mean().index],
        "평균%": grouped.mean().values,
        "중앙값%": grouped.median().values,
        "상승비율%": grouped.apply(lambda s: (s > 0).mean() * 100).values,
        "표본(개월)": grouped.count().values,
    })

    names = dict(enumerate(["월", "화", "수", "목", "금", "토", "일"]))
    by_day = ret.groupby(ret.index.dayofweek)
    weekday = pd.DataFrame({
        "요일": [names[d] for d in by_day.mean().index],
        "평균%": by_day.mean().values * 100,
        "표준편차%": by_day.std().values * 100,
        "일수": by_day.count().values,
    })

    up, down = ret.nlargest(10), ret.nsmallest(10)
    extremes = pd.DataFrame({
        "순위": range(1, len(up) + 1),
        "상승일": up.index,
        "상승률%": up.values * 100,
        "하락일": down.index,
        "하락률%": down.values * 100,
    })

    return {
        "close": close, "ret": ret, "ma50": ma50, "ma200": ma200, "drawdown": drawdown,
        "total": total, "cagr": cagr, "mdd": drawdown.min(),
        "summary": summary, "yearly": yearly, "seasonal": seasonal,
        "weekday": weekday, "extremes": extremes,
    }


# ---------------------------------------------------------------- 3. 그래프

def comma_axis(ax):
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:,.0f}"))


def date_axis(ax):
    locator = mdates.AutoDateLocator()
    ax.xaxis.set_major_locator(locator)
    ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))


def draw_close(fig, close):
    """요청 그래프: 기간별 종가 라인그래프 (기본 2000년 1월 ~ 2019년 12월)."""
    fig.clear()
    ax = fig.subplots()
    ax.plot(close.index, close, color=LINE_COLOR, linewidth=1.3, label="종가")
    ax.fill_between(close.index, close, close.min() * 0.95, color=LINE_COLOR, alpha=0.10)
    ax.set_ylim(bottom=close.min() * 0.95)
    # 최고점은 왼쪽, 최저점은 오른쪽에 라벨을 달아 축/선과 겹치지 않게 한다
    for date, color, dx, ha in ((close.idxmax(), UP_COLOR, -10, "right"), (close.idxmin(), DOWN_COLOR, 10, "left")):
        ax.scatter([date], [close[date]], color=color, zorder=3, s=30)
        ax.annotate(f"{close[date]:,.1f}\n{date:%Y-%m-%d}", (date, close[date]),
                    xytext=(dx, 0), textcoords="offset points",
                    ha=ha, va="center", fontsize=9, color=color)
    ax.set_title(f"S&P 500 종가 추이 ({close.index[0]:%Y.%m} ~ {close.index[-1]:%Y.%m})")
    ax.set_xlabel("날짜")
    ax.set_ylabel("종가 (포인트)")
    comma_axis(ax)
    date_axis(ax)
    ax.legend(loc="upper left")
    return ax


def draw_trend(fig, close, ma50, ma200, drawdown):
    fig.clear()
    ax, ax_dd = fig.subplots(2, 1, sharex=True, height_ratios=[3, 1])
    ax.plot(close, color=MUTED, linewidth=0.8, label="종가")
    ax.plot(ma50, color="#f59e0b", linewidth=1.2, label="50일 이동평균")
    ax.plot(ma200, color=DOWN_COLOR, linewidth=1.2, label="200일 이동평균")
    ax.set_title("종가와 이동평균")
    comma_axis(ax)
    ax.legend(loc="upper left")
    ax_dd.fill_between(drawdown.index, drawdown * 100, 0, color=DOWN_COLOR, alpha=0.5)
    ax_dd.set_title("고점 대비 낙폭 (%)")
    date_axis(ax_dd)


def draw_yearly(fig, yearly):
    fig.clear()
    ax = fig.subplots()
    values = yearly["수익률%"]
    bars = ax.bar(yearly["연도"], values, color=[UP_COLOR if v >= 0 else DOWN_COLOR for v in values])
    ax.bar_label(bars, fmt="%.1f", fontsize=8, color=MUTED, padding=2)
    ax.axhline(0, color=MUTED, linewidth=0.8)
    ax.set_xticks(yearly["연도"])
    ax.tick_params(axis="x", rotation=45)
    ax.set_title("연도별 수익률 (%)")


def draw_seasonal(fig, seasonal):
    fig.clear()
    ax = fig.subplots()
    values = seasonal["평균%"]
    bars = ax.bar(seasonal["월"], values, color=[UP_COLOR if v >= 0 else DOWN_COLOR for v in values])
    ax.bar_label(bars, fmt="%.2f", fontsize=8, color=MUTED, padding=2)
    ax.axhline(0, color=MUTED, linewidth=0.8)
    ax.set_title("월별 평균 수익률 (%)")


def draw_distribution(fig, ret):
    fig.clear()
    ax_hist, ax_vol = fig.subplots(1, 2)
    pct_ret = ret * 100
    ax_hist.hist(pct_ret, bins=150, density=True, color=LINE_COLOR, alpha=0.8, label="실제 분포")
    # 같은 평균·표준편차의 정규분포와 겹쳐 보면 꼬리가 두꺼운 것이 보인다
    x = np.linspace(pct_ret.min(), pct_ret.max(), 400)
    mu, sigma = pct_ret.mean(), pct_ret.std()
    ax_hist.plot(x, np.exp(-((x - mu) ** 2) / (2 * sigma ** 2)) / (sigma * np.sqrt(2 * np.pi)),
                 color="#f59e0b", linewidth=1.2, label="정규분포")
    ax_hist.set_title("일간 수익률 분포 (%)")
    ax_hist.legend()
    rolling_vol = ret.rolling(20).std() * np.sqrt(252) * 100
    ax_vol.plot(rolling_vol, color="#a78bfa", linewidth=0.8)
    ax_vol.set_title("20일 롤링 변동성 (연환산 %)")
    date_axis(ax_vol)


# ---------------------------------------------------------------- 4. GUI

STYLE = """
QMainWindow, QWidget#central {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #0f172a, stop:1 #1e1b4b);
}
QWidget { color: #e2e8f0; font-family: 'Malgun Gothic'; font-size: 10pt; }

QFrame#header {
    border-radius: 16px;
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
        stop:0 #2563eb, stop:0.5 #00b4d8, stop:1 #7c3aed);
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

QDateEdit {
    background: #0f172a; border: 2px solid #334155; border-radius: 10px;
    padding: 6px 10px; font-size: 10pt; color: #f8fafc;
}
QDateEdit:focus { border: 2px solid #00b4d8; }
QCalendarWidget QWidget { background: #0f172a; alternate-background-color: #1e293b; }
QCalendarWidget QAbstractItemView { selection-background-color: #00b4d8; }

QPushButton {
    border: none; border-radius: 10px; padding: 9px 18px;
    font-weight: 700; color: white; background: #334155;
}
QPushButton:hover { background: #475569; }
QPushButton:disabled { background: #1e293b; color: #475569; }
QPushButton#primary {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #2563eb, stop:1 #00b4d8);
}
QPushButton#primary:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #3b82f6, stop:1 #38cff0);
}
QPushButton#primary:disabled { background: #1e293b; color: #475569; }

QTabWidget::pane { border: none; }
QTabBar::tab {
    background: transparent; color: #94a3b8; font-weight: 700;
    padding: 8px 16px; border-bottom: 2px solid transparent;
}
QTabBar::tab:selected { color: #f8fafc; border-bottom: 2px solid #00b4d8; }
QTabBar::tab:hover { color: #e2e8f0; }

QTableWidget {
    background: transparent; alternate-background-color: rgba(51, 65, 85, 0.35);
    border: none; gridline-color: transparent;
    selection-background-color: rgba(0, 180, 216, 0.35); selection-color: white;
}
QTableWidget::item { padding: 4px 8px; border-bottom: 1px solid rgba(148,163,184,0.08); }
QHeaderView, QTableCornerButton::section { background: #1e293b; border: none; }
QHeaderView::section {
    background: #1e293b; color: #94a3b8; font-weight: 700;
    border: none; border-bottom: 2px solid #00b4d8; padding: 8px;
}

QPlainTextEdit {
    background: #0f172a; border: none; border-radius: 10px; padding: 10px;
    font-family: 'Consolas', 'Malgun Gothic'; font-size: 10pt;
}
QSplitter::handle { background: transparent; }

QScrollBar:vertical { background: transparent; width: 10px; margin: 2px; }
QScrollBar::handle:vertical { background: #475569; border-radius: 4px; min-height: 30px; }
QScrollBar::handle:vertical:hover { background: #00b4d8; }
QScrollBar::add-line, QScrollBar::sub-line { height: 0; }
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
        self.setWindowTitle("S&P 500 데이터 분석")
        self.resize(1280, 880)
        self.setStyleSheet(STYLE)
        self.setAcceptDrops(True)
        self.df = None
        self.close_series = None

        # 상단 배너: 제목 + 분석 기간 요약
        header_frame = QFrame(objectName="header")
        titles = QVBoxLayout()
        titles.addWidget(QLabel("📈  S&P 500 데이터 분석", objectName="title"))
        titles.addWidget(QLabel("과거 시세 CSV를 정제하고 수익률·위험·계절성을 분석합니다", objectName="subtitle"))

        quote_frame = QFrame(objectName="quote")
        self.price_label = QLabel("-", objectName="price")
        self.change_label = QLabel("", objectName="change")
        self.quote_meta = QLabel("CSV 파일을 열어 주세요", objectName="quoteMeta")
        price_row = QHBoxLayout()
        price_row.addWidget(self.price_label)
        price_row.addSpacing(10)
        price_row.addWidget(self.change_label, 0, Qt.AlignmentFlag.AlignBottom)
        quote_box = QVBoxLayout(quote_frame)
        quote_box.setContentsMargins(18, 10, 18, 10)
        quote_box.addLayout(price_row)
        quote_box.addWidget(self.quote_meta)

        banner = QHBoxLayout(header_frame)
        banner.setContentsMargins(24, 18, 24, 18)
        banner.addLayout(titles, 1)
        banner.addWidget(quote_frame, 0, Qt.AlignmentFlag.AlignVCenter)

        # 파일 / 기간 / 저장
        self.open_btn = QPushButton("📂  CSV 열기")
        self.open_btn.clicked.connect(self.choose_file)
        self.file_label = QLabel("파일 없음", objectName="muted")
        self.start_edit = self.make_date_edit()
        self.end_edit = self.make_date_edit()
        self.full_btn = QPushButton("전체 기간")
        self.full_btn.clicked.connect(self.select_full_range)
        self.run_btn = QPushButton("🔄  분석", objectName="primary")
        self.run_btn.clicked.connect(self.run_analysis)
        self.save_btn = QPushButton("💾  그래프 저장")
        self.save_btn.clicked.connect(self.save_charts)
        for btn in (self.open_btn, self.full_btn, self.run_btn, self.save_btn):
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
        for widget in (self.start_edit, self.end_edit, self.full_btn, self.run_btn, self.save_btn):
            widget.setEnabled(False)

        control_card = self.make_card()
        top = QHBoxLayout(control_card)
        top.setContentsMargins(16, 14, 16, 14)
        top.addWidget(self.open_btn)
        top.addWidget(self.file_label, 1)
        top.addWidget(QLabel("분석 기간"))
        top.addWidget(self.start_edit)
        top.addWidget(QLabel("~"))
        top.addWidget(self.end_edit)
        top.addWidget(self.full_btn)
        top.addWidget(self.run_btn)
        top.addSpacing(12)
        top.addWidget(self.save_btn)

        # 결과 탭
        self.close_chart = Chart()
        self.trend_chart = Chart()
        self.yearly_chart = Chart()
        self.seasonal_chart = Chart()
        self.dist_chart = Chart()
        self.charts = {
            "01_close": self.close_chart,
            "02_trend_drawdown": self.trend_chart,
            "03_yearly_return": self.yearly_chart,
            "04_monthly_seasonality": self.seasonal_chart,
            "05_return_distribution": self.dist_chart,
        }

        self.hover_label = QLabel("그래프 위에 마우스를 올리면 날짜별 종가가 표시됩니다", objectName="hover")
        close_tab = QWidget()
        close_box = QVBoxLayout(close_tab)
        close_box.setContentsMargins(0, 8, 0, 0)
        close_box.addWidget(self.hover_label)
        close_box.addWidget(self.close_chart, 1)
        self.close_chart.mpl_connect("motion_notify_event", self.on_close_hover)

        self.summary_table = self.make_table()
        self.weekday_table = self.make_table()
        self.extreme_table = self.make_table()
        summary_tab = QWidget()
        grid = QGridLayout(summary_tab)
        grid.setContentsMargins(0, 8, 0, 0)
        grid.addWidget(QLabel("핵심 지표", objectName="cardTitle"), 0, 0)
        grid.addWidget(self.summary_table, 1, 0, 3, 1)
        grid.addWidget(QLabel("요일별 일간 수익률", objectName="cardTitle"), 0, 1)
        grid.addWidget(self.weekday_table, 1, 1)
        grid.addWidget(QLabel("일간 최대 상승 / 하락 Top 10", objectName="cardTitle"), 2, 1)
        grid.addWidget(self.extreme_table, 3, 1)
        grid.setColumnStretch(0, 5)
        grid.setColumnStretch(1, 6)
        # 요일 표는 5행이 모두 보이도록 높이를 고정하고 나머지는 Top 10 표에 준다
        self.weekday_table.setFixedHeight(5 * 30 + 44)
        grid.setRowStretch(3, 1)

        self.yearly_table = self.make_table()
        self.seasonal_table = self.make_table()

        self.data_table = self.make_table()
        self.log_text = QPlainTextEdit(readOnly=True)
        self.log_text.setLineWrapMode(QPlainTextEdit.LineWrapMode.NoWrap)
        clean_tab = QSplitter(Qt.Orientation.Horizontal)
        clean_tab.addWidget(self.log_text)
        clean_tab.addWidget(self.data_table)
        clean_tab.setSizes([480, 720])

        self.tabs = QTabWidget()
        self.tabs.addTab(close_tab, "📈  종가 추이")
        self.tabs.addTab(summary_tab, "📋  요약 지표")
        self.tabs.addTab(self.split(self.yearly_table, self.yearly_chart), "📅  연도별")
        self.tabs.addTab(self.split(self.seasonal_table, self.seasonal_chart), "🗓  월별 계절성")
        self.tabs.addTab(self.trend_chart, "📉  이동평균·낙폭")
        self.tabs.addTab(self.dist_chart, "📊  수익률 분포")
        self.tabs.addTab(clean_tab, "🧹  데이터 클렌징")
        result_card = self.make_card()
        box = QVBoxLayout(result_card)
        box.setContentsMargins(16, 8, 16, 12)
        box.addWidget(self.tabs)

        self.statusBar().showMessage("준비 - CSV 파일을 열거나 창에 끌어다 놓으세요")

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
    def make_date_edit():
        edit = QDateEdit(calendarPopup=True)
        edit.setDisplayFormat("yyyy-MM-dd")
        return edit

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
        splitter.setSizes([540, 660])
        return splitter

    @staticmethod
    def fill_table(table, frame, signed=()):
        """DataFrame을 표에 채운다. signed에 든 열은 부호에 따라 상승/하락 색을 칠한다."""
        table.setRowCount(len(frame))
        table.setColumnCount(len(frame.columns))
        table.setHorizontalHeaderLabels([str(c) for c in frame.columns])
        for r, row in enumerate(frame.itertuples(index=False)):
            for c, value in enumerate(row):
                if isinstance(value, pd.Timestamp):
                    text = f"{value:%Y-%m-%d}"
                elif isinstance(value, (int, np.integer)):
                    text = f"{value:,}" if frame.columns[c] != "연도" else str(value)
                elif isinstance(value, (float, np.floating)):
                    text = "-" if np.isnan(value) else f"{value:,.2f}"
                else:
                    text = str(value)
                item = QTableWidgetItem(text)
                if isinstance(value, (int, float, np.number)):
                    item.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
                if frame.columns[c] in signed and pd.notna(value) and value != 0:
                    item.setForeground(QColor(UP_COLOR if value > 0 else DOWN_COLOR))
                table.setItem(r, c, item)

    # --- 파일 불러오기

    def choose_file(self):
        path, _ = QFileDialog.getOpenFileName(self, "S&P 500 CSV 열기", "", "CSV 파일 (*.csv)")
        if path:
            self.load_file(path)

    def dragEnterEvent(self, event):
        urls = event.mimeData().urls()
        if urls and urls[0].toLocalFile().lower().endswith(".csv"):
            event.acceptProposedAction()

    def dropEvent(self, event):
        self.load_file(event.mimeData().urls()[0].toLocalFile())

    def load_file(self, path):
        try:
            df, log = load_and_clean(path)
        except (OSError, ValueError, KeyError) as e:
            QMessageBox.warning(self, "오류", f"파일을 불러오지 못했습니다.\n{e}")
            return
        if len(df) < MIN_ROWS:
            QMessageBox.warning(self, "오류", f"정제 후 데이터가 {len(df)}행뿐이라 분석할 수 없습니다.")
            return
        self.df = df
        self.file_label.setText(os.path.basename(path))
        self.file_label.setToolTip(path)
        self.log_text.setPlainText("\n".join(log))
        self.fill_table(self.data_table, df.sort_index(ascending=False).reset_index()
                        .rename(columns={v: k for k, v in COLUMNS.items()}), signed=("변동 %",))

        first, last = df.index.min(), df.index.max()
        for edit in (self.start_edit, self.end_edit):
            edit.setDateRange(QDate(first.year, first.month, first.day), QDate(last.year, last.month, last.day))
        # 기본 분석 기간: 2000년 1월 ~ 2019년 12월 (데이터 범위 안으로)
        start, end = max(first, DEFAULT_START), min(last, DEFAULT_END)
        if start >= end:
            start, end = first, last
        self.set_range(start, end)
        for widget in (self.start_edit, self.end_edit, self.full_btn, self.run_btn, self.save_btn):
            widget.setEnabled(True)
        self.run_analysis()

    def set_range(self, start, end):
        self.start_edit.setDate(QDate(start.year, start.month, start.day))
        self.end_edit.setDate(QDate(end.year, end.month, end.day))

    def select_full_range(self):
        self.set_range(self.df.index.min(), self.df.index.max())
        self.run_analysis()

    # --- 분석 / 표시

    def run_analysis(self):
        if self.df is None:
            return
        start = pd.Timestamp(self.start_edit.date().toPyDate())
        end = pd.Timestamp(self.end_edit.date().toPyDate())
        rows = len(self.df.loc[start:end])
        if start > end or rows < MIN_ROWS:
            QMessageBox.warning(self, "기간 확인", f"분석 기간에 거래일이 {MIN_ROWS}일 이상 있어야 합니다. (현재 {rows}일)")
            return

        res = analyze(self.df, start, end)
        close = res["close"]

        self.price_label.setText(f"{close.iloc[-1]:,.2f}")
        self.change_label.setText(f"{'▲' if res['total'] >= 0 else '▼'} {pct(abs(res['total']))}")
        self.change_label.setStyleSheet(f"color: {UP_COLOR if res['total'] >= 0 else DOWN_COLOR};")
        self.quote_meta.setText(
            f"{close.index[0]:%Y-%m-%d} ~ {close.index[-1]:%Y-%m-%d} 누적 수익률\n"
            f"CAGR {pct(res['cagr'])}  ·  MDD {pct(res['mdd'])}"
        )

        self.fill_table(self.summary_table, res["summary"])
        self.summary_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.fill_table(self.weekday_table, res["weekday"], signed=("평균%",))
        self.fill_table(self.extreme_table, res["extremes"], signed=("상승률%", "하락률%"))
        self.fill_table(self.yearly_table, res["yearly"], signed=("수익률%",))
        self.fill_table(self.seasonal_table, res["seasonal"], signed=("평균%", "중앙값%"))

        self.close_series = close
        close_ax = draw_close(self.close_chart.figure, close)
        self.hover_line = close_ax.axvline(close.index[0], color=MUTED, linewidth=0.8, visible=False)
        (self.hover_dot,) = close_ax.plot([], [], "o", color=LINE_COLOR, markersize=6)
        draw_trend(self.trend_chart.figure, close, res["ma50"], res["ma200"], res["drawdown"])
        draw_yearly(self.yearly_chart.figure, res["yearly"])
        draw_seasonal(self.seasonal_chart.figure, res["seasonal"])
        draw_distribution(self.dist_chart.figure, res["ret"])
        for chart in self.charts.values():
            chart.draw_idle()

        self.statusBar().showMessage(f"분석 완료: {close.index[0]:%Y-%m-%d} ~ {close.index[-1]:%Y-%m-%d}, {len(close):,}거래일")

    def on_close_hover(self, event):
        close = self.close_series
        if close is None or event.inaxes is None or event.xdata is None:
            return
        x = pd.Timestamp(mdates.num2date(event.xdata).replace(tzinfo=None))
        i = min(max(close.index.searchsorted(x), 1), len(close) - 1)
        if abs(close.index[i - 1] - x) < abs(close.index[i] - x):
            i -= 1
        date, value = close.index[i], close.iloc[i]
        change = value / close.iloc[i - 1] - 1 if i > 0 else 0
        self.hover_label.setText(f"{date:%Y-%m-%d} ({'월화수목금토일'[date.dayofweek]})   종가 {value:,.2f}   전일 대비 {change:+.2%}")
        self.hover_line.set_xdata([date, date])
        self.hover_line.set_visible(True)
        self.hover_dot.set_data([date], [value])
        self.close_chart.draw_idle()

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


def find_default_csv():
    for folder in (os.getcwd(), os.path.dirname(os.path.abspath(__file__))):
        path = os.path.join(folder, DEFAULT_CSV)
        if os.path.exists(path):
            return path
    return None


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle("Fusion")  # 스타일시트가 OS 기본 테마와 섞이지 않도록 Fusion 사용
    app.setWindowIcon(QIcon(resource_path("app_icon.ico")))
    window = MainWindow()
    window.show()
    csv_path = sys.argv[1] if len(sys.argv) > 1 else find_default_csv()
    if csv_path:
        window.load_file(csv_path)
    sys.exit(app.exec())
