"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "./icons";

const DEBOUNCE_MS = 300;

// Search is server-side (`?q=`), so typing is debounced into the URL; `team` is kept.
export function MemberSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);

  useEffect(() => {
    if (value.trim() === urlQuery.trim()) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value.trim()) params.set("q", value.trim());
      else params.delete("q");
      router.replace(`${pathname}?${params}`);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, urlQuery, searchParams, pathname, router]);

  return (
    <label className="relative block">
      <SearchIcon
        width={16}
        height={16}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by name or GitHub login…"
        aria-label="Search members"
        className="h-9 w-[320px] rounded-md border border-zinc-200 bg-white pl-10 pr-3 text-[13px] outline-none placeholder:text-zinc-500 focus:border-zinc-400"
      />
    </label>
  );
}
