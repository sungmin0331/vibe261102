"use client";

import { useEffect, useRef, useState } from "react";

import { recordViewAction } from "@/app/actions";
import { formatNumber } from "@/lib/format";

/** 글을 열 때 조회수를 한 번 올리고, 올라간 값을 보여 줍니다. */
export function ViewCounter({
  postId,
  initial,
}: {
  postId: number;
  initial: number;
}) {
  const [latest, setLatest] = useState<number | null>(null);
  // 화면이 숨겨졌다 다시 보일 때 effect가 다시 실행돼도 중복으로 세지 않도록 기억해 둡니다.
  const counted = useRef<number | null>(null);

  useEffect(() => {
    if (counted.current === postId) return;
    counted.current = postId;
    recordViewAction(postId).then((views) => {
      if (views !== null) setLatest(views);
    });
  }, [postId]);

  return <>{formatNumber(Math.max(initial, latest ?? 0))}</>;
}
