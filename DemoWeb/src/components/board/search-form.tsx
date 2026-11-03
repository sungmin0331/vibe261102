import { SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SearchField } from "@/lib/board";

const fieldOptions: Array<{ value: SearchField; label: string }> = [
  { value: "all", label: "제목+내용" },
  { value: "title", label: "제목" },
  { value: "content", label: "내용" },
];

/** GET 폼이라 검색 조건이 URL에 남아 새로고침·공유해도 그대로 유지됩니다. */
export function SearchForm({
  query,
  field,
}: {
  query: string;
  field: SearchField;
}) {
  return (
    <form
      action="/"
      role="search"
      className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
    >
      <select
        name="field"
        defaultValue={field}
        aria-label="검색 대상"
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        {fieldOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="검색어를 입력하세요"
          aria-label="검색어"
          className="sm:w-56"
        />
        <Button type="submit" variant="secondary">
          <SearchIcon data-icon="inline-start" />
          검색
        </Button>
      </div>
    </form>
  );
}
