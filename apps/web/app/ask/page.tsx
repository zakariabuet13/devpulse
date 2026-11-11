import { AskChat } from "@/components/AskChat";

export default function AskPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="-mb-[7px]">
        <h1 className="text-[32px] font-normal leading-10 text-zinc-900">
          Ask
        </h1>
        <p className="mt-1 text-[13px] text-zinc-600">
          Ask questions about your teams, issues and pull requests.
        </p>
      </div>
      <AskChat />
    </div>
  );
}
