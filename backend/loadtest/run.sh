#!/usr/bin/env bash
# Benchmarks the main read endpoints against a running API.
# Usage: BASE=http://localhost:5060 TOKEN=<jwt> DURATION=15 CONNECTIONS=10 loadtest/run.sh
set -euo pipefail
BASE=${BASE:-http://localhost:5060}
DURATION=${DURATION:-15}
CONNECTIONS=${CONNECTIONS:-10}
: "${TOKEN:?TOKEN is required}"

bench() {
  local name=$1 path=$2
  npx --yes autocannon@8 -j -d "$DURATION" -c "$CONNECTIONS" -H "Authorization=Bearer $TOKEN" "$BASE$path" 2>/dev/null |
    node -e '
      const r = JSON.parse(require("fs").readFileSync(0));
      const l = r.latency;
      console.log([process.argv[1].padEnd(22), String(Math.round(r.requests.average)).padStart(6) + " req/s",
        "p50 " + l.p50 + "ms", "p90 " + l.p90 + "ms", "p99 " + l.p99 + "ms",
        "non2xx " + r.non2xx, "errors " + r.errors].join("  "));
    ' "$name"
}

bench "dashboard analytics" "/api/expenses/analytics?period=this_month"
bench "balances" "/api/expenses/balances"
bench "net worth" "/api/networth/summary"
bench "history page" "/api/expenses?page=1&limit=20"
bench "budgets" "/api/budgets"
