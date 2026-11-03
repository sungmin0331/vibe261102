"""네이버 검색 결과에서 신문기사를 찾아 본문까지 크롤링하는 GUI 앱 (PyQt6 + requests + BeautifulSoup4).

사용법:
    pip install PyQt6 requests beautifulsoup4 openpyxl
    python naver_news_crawler.py
"""

import csv
import os
import sys
import time
from html import escape
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup
from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font, PatternFill
from PyQt6.QtCore import QThread, Qt, QUrl, pyqtSignal
from PyQt6.QtGui import QColor, QDesktopServices, QIcon
from PyQt6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QComboBox,
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
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

DEFAULT_QUERY = "반도체"

# 검색 범위별 URL. 통합검색은 처음 주어진 URL과 같은 형식이다.
SEARCH_URLS = {
    "통합검색": "https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query={query}",
    "뉴스 탭": "https://search.naver.com/search.naver?where=news&ie=utf8&query={query}",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    ),
    "Referer": "https://www.naver.com/",
}

def resource_path(name):
    # PyInstaller로 만든 exe에서는 함께 묶인 파일이 sys._MEIPASS 폴더에 풀린다
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


CSV_FIELDS = ["title", "press", "date", "summary", "content", "url", "naver_url"]

# 엑셀 저장 시 열 제목과 너비
EXCEL_COLUMNS = [
    ("title", "제목", 50),
    ("press", "언론사", 14),
    ("date", "날짜", 20),
    ("summary", "요약", 50),
    ("content", "본문", 80),
    ("url", "원문 링크", 40),
    ("naver_url", "네이버뉴스 링크", 40),
]
EXCEL_CELL_LIMIT = 32767  # 엑셀 셀 하나에 들어가는 최대 글자 수

# 화면 디자인 (Qt 스타일시트)
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
QLabel#badge {
    color: white; font-weight: 700; padding: 6px 14px; border-radius: 14px;
    background: rgba(255,255,255,0.22);
}

QFrame#card {
    background: rgba(30, 41, 59, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 14px;
}
QLabel#cardTitle { color: #94a3b8; font-weight: 700; background: transparent; }

QLineEdit, QComboBox {
    background: #0f172a; border: 2px solid #334155; border-radius: 10px;
    padding: 8px 12px; font-size: 11pt; color: #f8fafc;
    selection-background-color: #03c75a;
}
QLineEdit:focus, QComboBox:focus { border: 2px solid #03c75a; }
QComboBox::drop-down { border: none; width: 26px; }
QComboBox QAbstractItemView {
    background: #1e293b; border: 1px solid #334155; selection-background-color: #03c75a;
}

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
QPushButton#danger { background: #e11d48; }
QPushButton#danger:hover { background: #f43f5e; }
QPushButton#excel { background: #15803d; }
QPushButton#excel:hover { background: #16a34a; }
QPushButton#primary:disabled, QPushButton#danger:disabled, QPushButton#excel:disabled {
    background: #1e293b; color: #475569;
}

QTableWidget {
    background: transparent; alternate-background-color: rgba(51, 65, 85, 0.35);
    border: none; gridline-color: transparent;
    selection-background-color: rgba(3, 199, 90, 0.35); selection-color: white;
}
QTableWidget::item { padding: 6px; border-bottom: 1px solid rgba(148,163,184,0.08); }
QTableWidget::item:hover { background: rgba(0, 180, 216, 0.15); }
QTableWidget::item:selected { background: rgba(3, 199, 90, 0.30); color: white; }
QHeaderView, QTableCornerButton::section { background: #1e293b; border: none; }
QHeaderView::section {
    background: #1e293b; color: #94a3b8; font-weight: 700;
    border: none; border-bottom: 2px solid #03c75a; padding: 8px;
}

QTextBrowser { background: transparent; border: none; }

QSplitter::handle { background: transparent; height: 10px; }

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

# 기사 상세 보기 HTML 스타일
DETAIL_CSS = """
<style>
h2 { color: #f8fafc; font-size: 17pt; margin-bottom: 4px; }
.meta { color: #94a3b8; }
.press { color: #03c75a; font-weight: bold; }
a { color: #38cff0; font-weight: bold; text-decoration: none; }
p { color: #cbd5e1; line-height: 160%; font-size: 11pt; }
</style>
"""


# ---------------------------------------------------------------- 크롤링 로직

def get_soup(url):
    res = requests.get(url, headers=HEADERS, timeout=10)
    res.raise_for_status()
    return BeautifulSoup(res.text, "html.parser")


def clean(text):
    # 링크마다 붙는 스크린리더용 문구 제거
    return text.replace("새 창 열림", "").strip()


def build_search_url(query, scope):
    return SEARCH_URLS[scope].format(query=quote(query))


def parse_search_results(soup):
    """검색 결과 페이지에서 기사 목록(제목, 언론사, 요약, 링크)을 추출한다."""
    articles = []
    seen = set()
    for title_tag in soup.select('a[data-heatmap-target=".tit"]'):
        if title_tag["href"] in seen:
            continue
        seen.add(title_tag["href"])

        # 제목 링크에서 위로 올라가며 기사 하나를 감싸는 블록을 찾는다
        item = title_tag
        for _ in range(6):
            item = item.parent
            if item is None or item.select_one('[data-heatmap-target=".prof"]'):
                break
        if item is None:
            continue

        press_tag = item.select_one(".sds-comps-profile-info-title")
        body_tag = item.select_one('a[data-heatmap-target=".body"]')
        naver_tag = item.select_one('a[data-heatmap-target=".nav"]')

        articles.append({
            "title": clean(title_tag.get_text(" ", strip=True)),
            "press": clean(press_tag.get_text(" ", strip=True)) if press_tag else "",
            "date": "",
            "summary": clean(body_tag.get_text(" ", strip=True)) if body_tag else "",
            "content": "",
            "url": title_tag["href"],
            "naver_url": naver_tag["href"] if naver_tag else "",
        })
    return articles


def parse_naver_article(url):
    """네이버뉴스(n.news.naver.com) 기사 페이지에서 날짜와 본문을 추출한다."""
    soup = get_soup(url)

    date_tag = soup.select_one(".media_end_head_info_datestamp_time")
    body_tag = soup.select_one("#dic_area") or soup.select_one("#newsct_article")
    if body_tag is None:
        return {"date": "", "content": ""}

    # 본문 안의 사진 설명, 스크립트 등은 제외
    for tag in body_tag.select("script, style, .end_photo_org, .img_desc, em.img_desc"):
        tag.decompose()

    return {
        "date": date_tag.get("data-date-time", date_tag.get_text(strip=True)) if date_tag else "",
        "content": body_tag.get_text("\n", strip=True),
    }


def save_csv(articles, path):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(articles)


def save_excel(articles, path):
    wb = Workbook()
    ws = wb.active
    ws.title = "뉴스"

    ws.append([label for _, label, _ in EXCEL_COLUMNS])
    for col, (_, _, width) in enumerate(EXCEL_COLUMNS, 1):
        cell = ws.cell(row=1, column=col)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="03C75A")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[cell.column_letter].width = width

    for article in articles:
        # 엑셀이 허용하지 않는 제어 문자를 지우고 셀 글자 수 제한에 맞춘다
        ws.append([
            ILLEGAL_CHARACTERS_RE.sub("", article[key])[:EXCEL_CELL_LIMIT]
            for key, _, _ in EXCEL_COLUMNS
        ])
        row = ws.max_row
        for col, (key, _, _) in enumerate(EXCEL_COLUMNS, 1):
            cell = ws.cell(row=row, column=col)
            cell.alignment = Alignment(vertical="top", wrap_text=key in ("title", "summary"))
            if key.endswith("url") and cell.value:
                cell.hyperlink = cell.value
                cell.font = Font(color="0563C1", underline="single")

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    wb.save(path)


# ---------------------------------------------------------------- GUI

class CrawlWorker(QThread):
    """크롤링은 시간이 걸리므로 별도 스레드에서 실행해 화면이 멈추지 않게 한다."""

    found = pyqtSignal(int)                # 검색 결과 기사 수
    article_done = pyqtSignal(int, dict)   # (순번, 기사 정보)
    failed = pyqtSignal(str)

    def __init__(self, url, delay=1.0):
        super().__init__()
        self.url = url
        self.delay = delay
        self._stop = False

    def stop(self):
        self._stop = True

    def run(self):
        try:
            articles = parse_search_results(get_soup(self.url))
        except requests.RequestException as e:
            self.failed.emit(f"검색 페이지를 가져오지 못했습니다.\n{e}")
            return

        self.found.emit(len(articles))
        for i, article in enumerate(articles):
            if self._stop:
                break
            # 본문은 형식이 통일된 네이버뉴스 페이지에서만 가져온다
            if article["naver_url"]:
                try:
                    article.update(parse_naver_article(article["naver_url"]))
                except requests.RequestException:
                    pass
                time.sleep(self.delay)
            self.article_done.emit(i, article)


class MainWindow(QMainWindow):
    COLUMNS = ["제목", "언론사", "날짜", "본문"]

    def __init__(self):
        super().__init__()
        self.setWindowTitle("네이버 뉴스 크롤러")
        self.resize(1200, 820)
        self.setStyleSheet(STYLE)
        self.articles = []
        self.worker = None

        # 상단 배너
        header_frame = QFrame(objectName="header")
        title = QLabel("📰  네이버 뉴스 크롤러", objectName="title")
        subtitle = QLabel("검색어로 최신 기사를 모으고, 본문까지 한 번에 읽고 저장하세요", objectName="subtitle")
        self.count_badge = QLabel("기사 0건", objectName="badge")
        titles = QVBoxLayout()
        titles.addWidget(title)
        titles.addWidget(subtitle)
        banner = QHBoxLayout(header_frame)
        banner.setContentsMargins(24, 18, 24, 18)
        banner.addLayout(titles, 1)
        banner.addWidget(self.count_badge, 0, Qt.AlignmentFlag.AlignVCenter)

        # 검색 조건
        self.query_edit = QLineEdit(DEFAULT_QUERY)
        self.query_edit.setPlaceholderText("🔍  검색어를 입력하세요")
        self.query_edit.returnPressed.connect(self.start_crawl)
        self.scope_combo = QComboBox()
        self.scope_combo.addItems(SEARCH_URLS.keys())
        self.search_btn = QPushButton("🔍  검색", objectName="primary")
        self.search_btn.clicked.connect(self.start_crawl)
        self.stop_btn = QPushButton("⏹  중지", objectName="danger")
        self.stop_btn.setEnabled(False)
        self.stop_btn.clicked.connect(self.stop_crawl)
        self.save_btn = QPushButton("📄  CSV 저장")
        self.save_btn.setEnabled(False)
        self.save_btn.clicked.connect(self.save)
        self.excel_btn = QPushButton("📊  엑셀 저장", objectName="excel")
        self.excel_btn.setEnabled(False)
        self.excel_btn.clicked.connect(self.save_xlsx)
        for btn in (self.search_btn, self.stop_btn, self.save_btn, self.excel_btn):
            btn.setCursor(Qt.CursorShape.PointingHandCursor)

        search_card = self.make_card()
        top = QHBoxLayout(search_card)
        top.setContentsMargins(16, 14, 16, 14)
        top.addWidget(self.query_edit, 1)
        top.addWidget(self.scope_combo)
        top.addWidget(self.search_btn)
        top.addWidget(self.stop_btn)
        top.addSpacing(12)
        top.addWidget(self.save_btn)
        top.addWidget(self.excel_btn)

        # 기사 목록
        self.table = QTableWidget(0, len(self.COLUMNS))
        self.table.setHorizontalHeaderLabels(self.COLUMNS)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setAlternatingRowColors(True)
        self.table.setShowGrid(False)
        self.table.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.table.verticalHeader().setVisible(False)
        self.table.verticalHeader().setDefaultSectionSize(38)
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        for col in range(1, len(self.COLUMNS)):
            header.setSectionResizeMode(col, QHeaderView.ResizeMode.ResizeToContents)
        self.table.itemSelectionChanged.connect(self.show_detail)

        # 기사 본문
        self.detail = QTextBrowser()
        self.detail.setOpenLinks(False)
        self.detail.anchorClicked.connect(QDesktopServices.openUrl)

        self.detail.setHtml(self.placeholder_html())

        splitter = QSplitter(Qt.Orientation.Vertical)
        splitter.addWidget(self.wrap_card("📋  기사 목록", self.table))
        splitter.addWidget(self.wrap_card("📖  기사 본문", self.detail))
        splitter.setSizes([330, 400])

        self.progress = QProgressBar()
        self.progress.setVisible(False)
        self.statusBar().addPermanentWidget(self.progress)

        layout = QVBoxLayout()
        layout.setContentsMargins(18, 18, 18, 6)
        layout.setSpacing(14)
        layout.addWidget(header_frame)
        layout.addWidget(search_card)
        layout.addWidget(splitter, 1)
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

    def wrap_card(self, caption, widget):
        card = self.make_card()
        box = QVBoxLayout(card)
        box.setContentsMargins(16, 12, 16, 12)
        box.addWidget(QLabel(caption, objectName="cardTitle"))
        box.addWidget(widget)
        return card

    @staticmethod
    def placeholder_html():
        return (
            DETAIL_CSS
            + "<div align='center'><br><br><p style='font-size:28pt'>🗞️</p>"
            "<p>검색 후 목록에서 기사를 선택하면 본문이 여기에 표시됩니다.</p></div>"
        )

    # --- 크롤링 제어

    def start_crawl(self):
        query = self.query_edit.text().strip()
        if not query or (self.worker and self.worker.isRunning()):
            return

        self.articles = []
        self.table.setRowCount(0)
        self.detail.setHtml(self.placeholder_html())
        self.count_badge.setText("기사 0건")
        self.set_running(True)
        self.statusBar().showMessage(f"'{query}' 검색 중...")

        self.worker = CrawlWorker(build_search_url(query, self.scope_combo.currentText()))
        self.worker.found.connect(self.on_found)
        self.worker.article_done.connect(self.on_article_done)
        self.worker.failed.connect(self.on_failed)
        self.worker.finished.connect(self.on_finished)
        self.worker.start()

    def stop_crawl(self):
        if self.worker:
            self.worker.stop()
            self.statusBar().showMessage("중지하는 중...")

    def set_running(self, running):
        self.search_btn.setEnabled(not running)
        self.stop_btn.setEnabled(running)
        self.save_btn.setEnabled(not running and bool(self.articles))
        self.excel_btn.setEnabled(not running and bool(self.articles))
        self.progress.setVisible(running)

    # --- 워커 시그널 처리

    def on_found(self, count):
        self.progress.setRange(0, max(count, 1))
        self.progress.setValue(0)
        self.statusBar().showMessage(f"기사 {count}건 발견, 본문 수집 중...")

    def on_article_done(self, index, article):
        self.articles.append(article)
        row = self.table.rowCount()
        self.table.insertRow(row)
        has_content = "✅" if article["content"] else "➖"
        for col, value in enumerate([article["title"], article["press"], article["date"], has_content]):
            item = QTableWidgetItem(value)
            if col == 1:
                item.setForeground(QColor("#03c75a"))
            elif col == 2:
                item.setForeground(QColor("#94a3b8"))
            elif col == 3:
                item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table.setItem(row, col, item)
        self.progress.setValue(index + 1)
        self.count_badge.setText(f"기사 {len(self.articles)}건")
        if row == 0:
            self.table.selectRow(0)

    def on_failed(self, message):
        QMessageBox.warning(self, "오류", message)

    def on_finished(self):
        self.set_running(False)
        self.statusBar().showMessage(f"완료: 기사 {len(self.articles)}건")

    # --- 상세 보기 / 저장

    def show_detail(self):
        rows = self.table.selectionModel().selectedRows()
        if not rows:
            return
        a = self.articles[rows[0].row()]
        link = escape(a["naver_url"] or a["url"])
        body = a["content"] or a["summary"]
        paragraphs = "".join(f"<p>{escape(line)}</p>" for line in body.splitlines() if line.strip())
        self.detail.setHtml(
            DETAIL_CSS
            + f"<h2>{escape(a['title'])}</h2>"
            f"<p class='meta'><span class='press'>{escape(a['press'])}</span> · 🕒 {a['date']}"
            f" &nbsp;&nbsp; <a href='{link}'>🔗 기사 원문 열기</a></p>"
            f"<hr style='background-color:#334155'>{paragraphs}"
        )

    def save(self):
        self.save_to("CSV 저장", "naver_news.csv", "CSV 파일 (*.csv)", save_csv)

    def save_xlsx(self):
        self.save_to("엑셀 저장", "naver_news.xlsx", "Excel 파일 (*.xlsx)", save_excel)

    def save_to(self, caption, default_name, file_filter, writer):
        path, _ = QFileDialog.getSaveFileName(self, caption, default_name, file_filter)
        if not path:
            return
        try:
            writer(self.articles, path)
        except OSError as e:
            QMessageBox.warning(self, "오류", f"저장하지 못했습니다.\n{e}")
            return
        self.statusBar().showMessage(f"{len(self.articles)}건을 {path}에 저장했습니다.")

    def closeEvent(self, event):
        if self.worker and self.worker.isRunning():
            self.worker.stop()
            self.worker.wait()
        super().closeEvent(event)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle("Fusion")  # 스타일시트가 OS 기본 테마와 섞이지 않도록 Fusion 사용
    app.setWindowIcon(QIcon(resource_path("app_icon.ico")))
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
