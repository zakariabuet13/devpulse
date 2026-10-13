import { BellIcon, GithubIcon, LogoIcon } from "./icons";

export function TopBar() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-white">
          <LogoIcon width={16} height={16} />
        </span>
        <span className="text-[17px] font-medium text-zinc-900">DevPulse</span>
      </div>
      <div className="flex items-center gap-5 text-[13px] text-zinc-500">
        <span className="flex items-center gap-2">
          <GithubIcon />
          GitHub connected
        </span>
        <BellIcon />
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-800">
          JD
        </span>
      </div>
    </header>
  );
}
