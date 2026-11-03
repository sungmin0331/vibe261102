import { MessagesSquareIcon, PenSquareIcon } from "lucide-react";
import Link from "next/link";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <MessagesSquareIcon className="size-5 text-primary" />
          <span>DemoWeb 게시판</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/posts/new">
              <PenSquareIcon data-icon="inline-start" />
              글쓰기
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
