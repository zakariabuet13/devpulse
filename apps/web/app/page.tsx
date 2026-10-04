import { healthSchema } from "@devpulse/shared";

export default function Home() {
  const health = healthSchema.parse({ status: "ok" });
  return (
    <main className="flex flex-1 items-center justify-center p-16">
      <h1 className="text-3xl font-semibold">DevPulse · {health.status}</h1>
    </main>
  );
}
