"""네이버 증권(stock.naver.com)에서 코스피200 지수 데이터를 가져와 CSV로 저장하는 스크립트.

stock.naver.com/market/stock/kr 페이지는 Next.js로 만들어져 시세를 브라우저에서 JavaScript로
불러오기 때문에, HTML을 BeautifulSoup으로 파싱하면 시세 숫자가 들어있지 않다.
그래서 페이지가 내부적으로 호출하는 JSON API를 requests로 직접 호출한다.

사용법:
    pip install requests
    python kospi200_crawler.py             # 현재 시세 + 최근 20거래일 + 편입 종목 200개
    python kospi200_crawler.py --days 100  # 최근 100거래일
"""

import argparse
import csv
import sys
import time

import requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    ),
    "Referer": "https://stock.naver.com/market/stock/kr",
}
REALTIME_URL = "https://polling.finance.naver.com/api/realtime/domestic/index/KPI200"
DAILY_URL = "https://m.stock.naver.com/api/index/KPI200/price"
STOCKS_URL = "https://m.stock.naver.com/api/index/KPI200/enrollStocks"
PAGE_SIZE = 20


def fetch_current():
    """코스피200 현재 시세(장중이면 실시간)를 가져온다."""
    res = requests.get(REALTIME_URL, headers=HEADERS, timeout=10)
    res.raise_for_status()
    d = res.json()["datas"][0]
    return {
        "종목명": d["stockName"],
        "현재가": d["closePrice"],
        "전일대비": d["compareToPreviousClosePrice"],
        "등락률(%)": d["fluctuationsRatio"],
        "시가": d["openPrice"],
        "고가": d["highPrice"],
        "저가": d["lowPrice"],
        "거래량": d["accumulatedTradingVolume"],
        "거래대금": d["accumulatedTradingValue"],
        "장상태": d["marketStatus"],
        "기준시각": d["localTradedAt"],
    }


def fetch_daily(days):
    """최근 days 거래일의 일별 시세를 최신순으로 가져온다."""
    rows = []
    page = 1
    while len(rows) < days:
        res = requests.get(
            DAILY_URL,
            params={"page": page, "pageSize": PAGE_SIZE},
            headers=HEADERS,
            timeout=10,
        )
        res.raise_for_status()
        items = res.json()
        if not items:
            break
        for d in items:
            rows.append({
                "날짜": d["localTradedAt"],
                "종가": d["closePrice"],
                "전일대비": d["compareToPreviousClosePrice"],
                "등락률(%)": d["fluctuationsRatio"],
                "시가": d["openPrice"],
                "고가": d["highPrice"],
                "저가": d["lowPrice"],
            })
        page += 1
    return rows[:days]


def fetch_stocks(on_page=None):
    """코스피200 편입 종목 전체를 페이지를 넘겨가며 시가총액 순으로 가져온다.

    on_page(page, 이번 페이지 건수, 누적 건수)가 주어지면 페이지마다 호출한다.
    """
    rows = []
    seen = set()
    page = 1
    while True:
        res = requests.get(
            STOCKS_URL,
            params={"page": page, "pageSize": PAGE_SIZE},
            headers=HEADERS,
            timeout=10,
        )
        res.raise_for_status()
        items = res.json()
        if not items:
            break
        for d in items:
            # 장중에 순위가 바뀌면 페이지 경계에서 같은 종목이 두 번 나올 수 있다
            if d["itemCode"] in seen:
                continue
            seen.add(d["itemCode"])
            rows.append({
                "순위": len(rows) + 1,
                "종목코드": d["itemCode"],
                "종목명": d["stockName"],
                "현재가": d["closePrice"],
                "전일대비": d["compareToPreviousClosePrice"],
                "등락률(%)": d["fluctuationsRatio"],
                "거래량": d["accumulatedTradingVolume"],
                "거래대금(백만)": d["accumulatedTradingValue"],
                "시가총액(억)": d["marketValue"],
            })
        if on_page:
            on_page(page, len(items), len(rows))
        if len(items) < PAGE_SIZE:
            break
        page += 1
        time.sleep(0.3)
    return rows


def save_csv(path, rows):
    # utf-8-sig: 엑셀에서 열어도 한글이 깨지지 않도록 BOM 포함
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="코스피200 지수 크롤러")
    parser.add_argument("--days", type=int, default=20, help="가져올 거래일 수 (기본 20)")
    parser.add_argument("--out", default="kospi200_daily.csv", help="일별 시세 CSV 파일명")
    parser.add_argument("--stocks-out", default="kospi200_stocks.csv", help="편입 종목 CSV 파일명")
    args = parser.parse_args()

    current = fetch_current()
    print(f"[{current['종목명']}] {current['기준시각']} ({current['장상태']})")
    print(
        f"  현재가 {current['현재가']}  전일대비 {current['전일대비']} "
        f"({current['등락률(%)']}%)"
    )
    print(f"  시가 {current['시가']}  고가 {current['고가']}  저가 {current['저가']}")
    print(f"  거래량 {current['거래량']}  거래대금 {current['거래대금']}")

    daily = fetch_daily(args.days)
    save_csv(args.out, daily)
    print(f"\n일별 시세 {len(daily)}건을 {args.out}에 저장했습니다.")
    for row in daily[:5]:
        print(f"  {row['날짜']}  {row['종가']:>8}  {row['전일대비']:>7}  {row['등락률(%)']:>6}%")

    print("\n편입 종목 수집 중...")
    stocks = fetch_stocks(
        lambda page, count, total: print(f"  {page}페이지: {count}건 (누적 {total}건)")
    )
    save_csv(args.stocks_out, stocks)
    print(f"편입 종목 {len(stocks)}건을 {args.stocks_out}에 저장했습니다.")
    for row in stocks[:5]:
        print(f"  {row['순위']:>3}. {row['종목명']}({row['종목코드']})  {row['현재가']}  {row['등락률(%)']}%")


if __name__ == "__main__":
    try:
        main()
    finally:
        # exe를 더블클릭해서 실행하면 끝나자마자 창이 닫히므로 결과를 볼 수 있게 대기
        if getattr(sys, "frozen", False):
            input("\nEnter 키를 누르면 종료합니다...")
