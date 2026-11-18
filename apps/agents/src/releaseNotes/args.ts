import { parseArgs as nodeParseArgs } from "node:util";
import { RELEASE_NOTES_CONFIG } from "./config";

export type Args = {
  from: string;
  to: string;
  version: string;
  maxTurns: number;
  maxBudget: number;
  abortAfter?: number;
};

export const USAGE =
  "usage: --from <ref> [--to HEAD] --version <x.y.z> [--max-turns n] [--max-budget usd] [--abort-after seconds]";

const SEMVER = /^\d+\.\d+\.\d+$/;

function positive(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--${name} must be a positive number. ${USAGE}`);
  }
  return n;
}

export function parseArgs(argv: string[]): Args {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: argv,
      options: {
        from: { type: "string" },
        to: { type: "string" },
        version: { type: "string" },
        "max-turns": { type: "string" },
        "max-budget": { type: "string" },
        "abort-after": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (e) {
    throw new Error(`${(e as Error).message}. ${USAGE}`);
  }

  if (!values.from) throw new Error(`--from is required. ${USAGE}`);
  if (values.version === undefined || !SEMVER.test(values.version)) {
    throw new Error(`--version must be x.y.z. ${USAGE}`);
  }

  const maxTurns = positive("max-turns", values["max-turns"]);
  const maxBudget = positive("max-budget", values["max-budget"]);
  const abortAfter = positive("abort-after", values["abort-after"]);

  return {
    from: values.from,
    to: values.to ?? "HEAD",
    version: values.version,
    maxTurns: Math.min(maxTurns ?? Infinity, RELEASE_NOTES_CONFIG.maxTurns),
    maxBudget: Math.min(
      maxBudget ?? Infinity,
      RELEASE_NOTES_CONFIG.maxBudgetUsd,
    ),
    abortAfter,
  };
}
