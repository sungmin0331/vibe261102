"""코스피200 지수 시세와 편입 종목 200개를 조회하고 저장하는 GUI 앱 (PyQt6).

데이터 수집은 kospi200_crawler.py의 함수를 그대로 사용한다.

사용법:
    pip install PyQt6 requests openpyxl
    python kospi200_gui.py
"""

import os
import sys

import requests
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from PyQt6.QtCore import QThread, Qt, pyqtSignal
from PyQt6.QtGui import QColor, QIcon
from PyQt6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QFileDialog,
    QFrame,
    QGraphicsDropShadowEffect,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QSpinBox,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from kospi200_crawler import fetch_current, fetch_daily, fetch_stocks, save_csv

UP_COLOR = "#f43f5e"    # 국내 증시 관례: 상승은 빨강
DOWN_COLOR = "#3b82f6"  # 하락은 파랑
FLAT_COLOR = "#94a3b8"
EXPECTED_STOCKS = 200   # 진행률 표시용 예상 종목 수


def resource_path(name):
    # PyInstaller로 만든 exe에서는 함께 묶인 파일이 sys._MEIPASS 폴더에 풀린다
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


def to_number(text):
    """'1,234' 같은 문자열을 정렬용 숫자로 바꾼다. 숫자가 아니면 0."""
    try:
        return float(str(text).replace(",", ""))
    except ValueError:
        return 0.0


def change_color(value):
    n = to_number(value)
    return UP_COLOR if n > 0 else DOWN_COLOR if n < 0 else FLAT_COLOR


# 화면 디자인 (Qt 스타일시트) - 네이버 뉴스 크롤러와 같은 톤
STYLE = """
QMainWindow, QWidget#central {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #0f172a, stop:1 #1e1b4b);
}
QWidget { color: #e2e8f0; font-family: 'Malgun Gothic'; font-size: 10pt; }

QFrame#header {
    border-radius: 16px;
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
        stop:0 #03c75a, stop:0.5 #00b4d8, stop:1 #7c3aed);
}
QLabel#title { color: white; font-size: 20pt; font-weight: 800; background: transparent; }
QLabel#subtitle { color: rgba(255,255,255,0.85); font-size: 10pt; background: transparent; }

QFrame#quote {
    border-radius: 12px; background: rgba(15, 23, 42, 0.55);
}
QLabel#price { color: white; font-size: 22pt; font-weight: 800; background: transparent; }
QLabel#change { font-size: 12pt; font-weight: 700; background: transparent; }
QLabel#quoteMeta { color: rgba(255,255,255,0.75); font-size: 9pt; background: transparent; }

QFrame#card {
    background: rgba(30, 41, 59, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 14px;
}
QLabel#cardTitle { color: #94a3b8; font-weight: 700; background: transparent; }

QLineEdit, QSpinBox {
    background: #0f172a; border: 2px solid #334155; border-radius: 10px;
    padding: 7px 12px; font-size: 11pt; color: #f8fafc;
    selection-background-color: #03c75a;
}
QLineEdit:focus, QSpinBox:focus { border: 2px solid #03c75a; }

QPushButton {
    border: none; border-radius: 10px; padding: 9px 18px;
    font-weight: 700; color: white; background: #334155;
}
QPushButton:hover { background: #475569; }
QPushButton:disabled { background: #1e293b; color: #475569; }
QPushButton#primary {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #03c75a, stop:1 #00b4d8);
}
QPushButton#primary:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #22e07a, stop:1 #38cff0);
}
QPushButton#excel { background: #15803d; }
QPushButton#excel:hover { background: #16a34a; }
QPushButton#primary:disabled, QPushButton#excel:disabled {
    background: #1e293b; color: #475569;
}

QTabWidget::pane { border: none; }
QTabBar::tab {
    background: transparent; color: #94a3b8; font-weight: 700;
    padding: 8px 18px; border-bottom: 2px solid transparent;
}
QTabBar::tab:selected { color: #f8fafc; border-bottom: 2px solid #03c75a; }
QTabBar::tab:hover { color: #e2e8f0; }

QTableWidget {
    background: transparent; alternate-background-color: rgba(51, 65, 85, 0.35);
    border: none; gridline-color: transparent;
    selection-background-color: rgba(3, 199, 90, 0.35); selection-color: white;
}
QTableWidget::item { padding: 4px 8px; border-bottom: 1px solid rgba(148,163,184,0.08); }
QTableWidget::item:selected { background: rgba(3, 199, 90, 0.30); color: white; }
QHeaderView, QTableCornerButton::section { background: #1e293b; border: none; }
QHeaderView::section {
    background: #1e293b; color: #94a3b8; font-weight: 700;
    border: none; border-bottom: 2px solid #03c75a; padding: 8px;
}

QScrollBar:vertical { background: transparent; width: 10px; margin: 2px; }
QScrollBar::handle:vertical { background: #475569; border-radius: 4px; min-height: 30px; }
QScrollBar::handle:vertical:hover { background: #03c75a; }
QScrollBar::add-line, QScrollBar::sub-line { height: 0; }
QScrollBar::add-page, QScrollBar::sub-page { background: none; }

QStatusBar { background: transparent; color: #94a3b8; }
QProgressBar {
    background: #1e293b; border: none; border-radius: 6px; height: 12px;
    min-width: 220px; max-height: 12px; text-align: center; color: transparent;
}
QProgressBar::chunk {
    border-radius: 6px;
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #03c75a, stop:1 #7c3aed);
}
QMessageBox, QFileDialog { background: #1e293b; }
"""

# (데이터 키, 표 제목, 숫자 열 여부, 등락 색 표시 여부)
STOCK_COLUMNS = [
    ("순위", "순위", True, False),
    ("종목코드", "종목코드", False, False),
    ("종목명", "종목명", False, False),
    ("현재가", "현재가", True, True),
    ("전일대비", "전일대비", True, True),
    ("등락률(%)", "등락률(%)", True, True),
    ("거래량", "거래량", True, False),
    ("거래대금(백만)", "거래대금(백만)", True, False),
    ("시가총액(억)", "시가총액(억)", True, False),
]
DAILY_COLUMNS = [
    ("날짜", "날짜", False, False),
    ("종가", "종가", True, True),
    ("전일대비", "전일대비", True, True),
    ("등락률(%)", "등락률(%)", True, True),
    ("시가", "시가", True, False),
    ("고가", "고가", True, False),
    ("저가", "저가", True, False),
]


# ---------------------------------------------------------------- 저장

def save_excel(stocks, daily, path):
    """편입 종목과 일별 시세를 시트 두 개로 나눠 엑셀 파일 하나에 저장한다."""
    wb = Workbook()
    sheets = [("편입 종목", stocks, STOCK_COLUMNS), ("일별 시세", daily, DAILY_COLUMNS)]
    for i, (title, rows, columns) in enumerate(sheets):
        ws = wb.active if i == 0 else wb.create_sheet()
        ws.title = title
        ws.append([label for _, label, _, _ in columns])
        for col in range(1, len(columns) + 1):
            cell = ws.cell(row=1, column=col)
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="03C75A")
            cell.alignment = Alignment(horizontal="center", vertical="center")
            ws.column_dimensions[cell.column_letter].width = 16
        for row in rows:
            # 엑셀에서 계산·정렬할 수 있도록 숫자 열은 숫자로 넣는다
            ws.append([
                to_number(row[key]) if numeric else row[key]
                for key, _, numeric, _ in columns
            ])
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
    wb.save(path)


# ---------------------------------------------------------------- GUI

class NumericItem(QTableWidgetItem):
    """콤마가 들어간 숫자도 크기 순으로 정렬되는 표 셀."""

    def __lt__(self, other):
        return to_number(self.text()) < to_number(other.text())


class FetchWorker(QThread):
    """수집은 시간이 걸리므로 별도 스레드에서 실행해 화면이 멈추지 않게 한다."""

    current_ready = pyqtSignal(dict)
    daily_ready = pyqtSignal(list)
    page_done = pyqtSignal(int, int)   # (페이지 번호, 누적 종목 수)
    stocks_ready = pyqtSignal(list)
    failed = pyqtSignal(str)

    def __init__(self, days):
        super().__init__()
        self.days = days

    def run(self):
        try:
            self.current_ready.emit(fetch_current())
            self.daily_ready.emit(fetch_daily(self.days))
            stocks = fetch_stocks(lambda page, count, total: self.page_done.emit(page, total))
            self.stocks_ready.emit(stocks)
        except (requests.RequestException, KeyError, ValueError) as e:
            self.failed.emit(f"데이터를 가져오지 못했습니다.\n{e}")


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("코스피200 크롤러")
        self.resize(1200, 820)
        self.setStyleSheet(STYLE)
        self.stocks = []
        self.daily = []
        self.worker = None

        # 상단 배너: 제목 + 지수 현재 시세
        header_frame = QFrame(objectName="header")
        title = QLabel("📈  코스피200 크롤러", objectName="title")
        subtitle = QLabel("네이버 증권에서 코스피200 지수와 편입 종목 전체를 모아 저장하세요", objectName="subtitle")
        titles = QVBoxLayout()
        titles.addWidget(title)
        titles.addWidget(subtitle)

        quote_frame = QFrame(objectName="quote")
        self.price_label = QLabel("-", objectName="price")
        self.change_label = QLabel("", objectName="change")
        self.quote_meta = QLabel("조회 버튼을 눌러 주세요", objectName="quoteMeta")
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

        # 조회 조건과 버튼
        self.days_spin = QSpinBox()
        self.days_spin.setRange(1, 1000)
        self.days_spin.setValue(20)
        self.days_spin.setSuffix(" 거래일")
        self.fetch_btn = QPushButton("🔄  조회", objectName="primary")
        self.fetch_btn.clicked.connect(self.start_fetch)
        self.filter_edit = QLineEdit()
        self.filter_edit.setPlaceholderText("🔍  종목명 또는 코드로 찾기")
        self.filter_edit.textChanged.connect(self.apply_filter)
        self.csv_btn = QPushButton("📄  CSV 저장")
        self.csv_btn.setEnabled(False)
        self.csv_btn.clicked.connect(self.save_csv_files)
        self.excel_btn = QPushButton("📊  엑셀 저장", objectName="excel")
        self.excel_btn.setEnabled(False)
        self.excel_btn.clicked.connect(self.save_xlsx)
        for btn in (self.fetch_btn, self.csv_btn, self.excel_btn):
            btn.setCursor(Qt.CursorShape.PointingHandCursor)

        control_card = self.make_card()
        top = QHBoxLayout(control_card)
        top.setContentsMargins(16, 14, 16, 14)
        top.addWidget(QLabel("일별 시세"))
        top.addWidget(self.days_spin)
        top.addWidget(self.fetch_btn)
        top.addSpacing(12)
        top.addWidget(self.filter_edit, 1)
        top.addSpacing(12)
        top.addWidget(self.csv_btn)
        top.addWidget(self.excel_btn)

        # 결과 표
        self.stock_table = self.make_table(STOCK_COLUMNS, stretch_col=2)
        self.daily_table = self.make_table(DAILY_COLUMNS, stretch_col=None)
        self.tabs = QTabWidget()
        self.tabs.addTab(self.stock_table, "🏢  편입 종목 (0)")
        self.tabs.addTab(self.daily_table, "📅  일별 시세 (0)")
        result_card = self.make_card()
        box = QVBoxLayout(result_card)
        box.setContentsMargins(16, 8, 16, 12)
        box.addWidget(self.tabs)

        self.progress = QProgressBar()
        self.progress.setVisible(False)
        self.statusBar().addPermanentWidget(self.progress)
        self.statusBar().showMessage("준비")

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
    def make_table(columns, stretch_col):
        table = QTableWidget(0, len(columns))
        table.setHorizontalHeaderLabels([label for _, label, _, _ in columns])
        table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        table.setAlternatingRowColors(True)
        table.setShowGrid(False)
        table.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        table.verticalHeader().setVisible(False)
        table.verticalHeader().setDefaultSectionSize(34)
        header = table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        if stretch_col is not None:
            for col in range(len(columns)):
                if col != stretch_col:
                    header.setSectionResizeMode(col, QHeaderView.ResizeMode.ResizeToContents)
        return table

    @staticmethod
    def fill_table(table, columns, rows, order):
        table.setSortingEnabled(False)
        table.setRowCount(len(rows))
        for r, row in enumerate(rows):
            # 같은 행은 전일대비 부호에 따라 같은 색으로 칠한다
            color = change_color(row.get("전일대비", 0))
            for c, (key, _, numeric, colored) in enumerate(columns):
                text = str(row[key])
                item = NumericItem(text) if numeric else QTableWidgetItem(text)
                if numeric:
                    item.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
                if colored:
                    item.setForeground(QColor(color))
                if key == "종목코드":
                    item.setForeground(QColor(FLAT_COLOR))
                table.setItem(r, c, item)
        # 정렬을 켜면 Qt 기본값(내림차순)으로 다시 정렬되므로 첫 열 기준 순서를 직접 지정한다
        table.setSortingEnabled(True)
        table.sortByColumn(0, order)

    # --- 수집 제어

    def start_fetch(self):
        if self.worker and self.worker.isRunning():
            return
        self.fetch_btn.setEnabled(False)
        self.csv_btn.setEnabled(False)
        self.excel_btn.setEnabled(False)
        self.progress.setRange(0, EXPECTED_STOCKS)
        self.progress.setValue(0)
        self.progress.setVisible(True)
        self.statusBar().showMessage("지수 시세 조회 중...")

        self.worker = FetchWorker(self.days_spin.value())
        self.worker.current_ready.connect(self.on_current)
        self.worker.daily_ready.connect(self.on_daily)
        self.worker.page_done.connect(self.on_page)
        self.worker.stocks_ready.connect(self.on_stocks)
        self.worker.failed.connect(self.on_failed)
        self.worker.finished.connect(self.on_finished)
        self.worker.start()

    # --- 워커 시그널 처리

    def on_current(self, d):
        color = change_color(d["전일대비"])
        arrow = "▲" if to_number(d["전일대비"]) > 0 else "▼" if to_number(d["전일대비"]) < 0 else "-"
        self.price_label.setText(d["현재가"])
        self.change_label.setText(f"{arrow} {d['전일대비'].lstrip('-')}  ({d['등락률(%)']}%)")
        self.change_label.setStyleSheet(f"color: {color};")
        status = "장중" if d["장상태"] == "OPEN" else "장마감"
        self.quote_meta.setText(
            f"{d['기준시각'][:16].replace('T', ' ')} {status}  ·  "
            f"시 {d['시가']}  고 {d['고가']}  저 {d['저가']}\n"
            f"거래량 {d['거래량']}  ·  거래대금 {d['거래대금']}"
        )

    def on_daily(self, rows):
        self.daily = rows
        self.fill_table(self.daily_table, DAILY_COLUMNS, rows, Qt.SortOrder.DescendingOrder)
        self.tabs.setTabText(1, f"📅  일별 시세 ({len(rows)})")
        self.statusBar().showMessage("편입 종목 수집 중...")

    def on_page(self, page, total):
        self.progress.setMaximum(max(EXPECTED_STOCKS, total))
        self.progress.setValue(total)
        self.statusBar().showMessage(f"편입 종목 수집 중... {page}페이지 (누적 {total}건)")

    def on_stocks(self, rows):
        self.stocks = rows
        self.fill_table(self.stock_table, STOCK_COLUMNS, rows, Qt.SortOrder.AscendingOrder)
        self.tabs.setTabText(0, f"🏢  편입 종목 ({len(rows)})")
        self.apply_filter(self.filter_edit.text())
        self.statusBar().showMessage(f"완료: 편입 종목 {len(rows)}건, 일별 시세 {len(self.daily)}건")

    def on_failed(self, message):
        self.statusBar().showMessage("수집 실패")
        QMessageBox.warning(self, "오류", message)

    def on_finished(self):
        self.fetch_btn.setEnabled(True)
        self.progress.setVisible(False)
        has_data = bool(self.stocks or self.daily)
        self.csv_btn.setEnabled(has_data)
        self.excel_btn.setEnabled(has_data)

    # --- 검색 / 저장

    def apply_filter(self, text):
        text = text.strip().lower()
        for r in range(self.stock_table.rowCount()):
            code = self.stock_table.item(r, 1).text()
            name = self.stock_table.item(r, 2).text().lower()
            self.stock_table.setRowHidden(r, bool(text) and text not in name and text not in code)

    def save_csv_files(self):
        folder = QFileDialog.getExistingDirectory(self, "CSV 저장 폴더 선택")
        if not folder:
            return
        saved = []
        try:
            for name, rows in (("kospi200_stocks.csv", self.stocks), ("kospi200_daily.csv", self.daily)):
                if rows:
                    save_csv(os.path.join(folder, name), rows)
                    saved.append(name)
        except OSError as e:
            QMessageBox.warning(self, "오류", f"저장하지 못했습니다.\n{e}")
            return
        self.statusBar().showMessage(f"{folder}에 {', '.join(saved)} 저장했습니다.")

    def save_xlsx(self):
        path, _ = QFileDialog.getSaveFileName(self, "엑셀 저장", "kospi200.xlsx", "Excel 파일 (*.xlsx)")
        if not path:
            return
        try:
            save_excel(self.stocks, self.daily, path)
        except OSError as e:
            QMessageBox.warning(self, "오류", f"저장하지 못했습니다.\n{e}")
            return
        self.statusBar().showMessage(f"{path}에 저장했습니다.")

    def closeEvent(self, event):
        if self.worker and self.worker.isRunning():
            self.worker.wait()
        super().closeEvent(event)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle("Fusion")  # 스타일시트가 OS 기본 테마와 섞이지 않도록 Fusion 사용
    app.setWindowIcon(QIcon(resource_path("app_icon.ico")))
    window = MainWindow()
    window.show()
    window.start_fetch()  # 실행하자마자 한 번 조회
    sys.exit(app.exec())
