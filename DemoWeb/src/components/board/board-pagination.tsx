import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

/** 현재 페이지 주변 번호만 보여 주고 나머지는 말줄임표로 줄입니다. */
function pageWindow(current: number, total: number, radius = 2) {
  const pages: Array<number | "gap"> = [];
  const start = Math.max(2, current - radius);
  const end = Math.min(total - 1, current + radius);

  pages.push(1);
  if (start > 2) pages.push("gap");
  for (let page = start; page <= end; page++) pages.push(page);
  if (end < total - 1) pages.push("gap");
  if (total > 1) pages.push(total);
  return pages;
}

export function BoardPagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number;
  totalPages: number;
  /** 페이지를 옮겨도 유지할 검색 조건 */
  searchParams: Record<string, string>;
}) {
  if (totalPages <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams(searchParams);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={href(Math.max(1, page - 1))}
            text="이전"
            aria-label="이전 페이지"
            aria-disabled={page === 1}
            className={page === 1 ? "pointer-events-none opacity-50" : ""}
          />
        </PaginationItem>
        {pageWindow(page, totalPages).map((item, index) =>
          item === "gap" ? (
            <PaginationItem key={`gap-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink href={href(item)} isActive={item === page}>
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            href={href(Math.min(totalPages, page + 1))}
            text="다음"
            aria-label="다음 페이지"
            aria-disabled={page === totalPages}
            className={
              page === totalPages ? "pointer-events-none opacity-50" : ""
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
