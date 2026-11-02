"""Where the bytes in signals.json go."""
import gzip, json, sys
d = json.load(open(sys.argv[1]))
raw = json.dumps(d, separators=(",", ":")).encode()
print(f"total {len(raw)/1024:.0f} KB minified, {len(gzip.compress(raw))/1024:.0f} KB gzipped")
for key in ("contracts", "insiders", "congress", "track_record", "review"):
    part = json.dumps(d.get(key), separators=(",", ":")).encode()
    print(f"  {key:12s} {len(part)/1024:6.0f} KB")
if d.get("contracts"):
    fields = {}
    for c in d["contracts"]:
        for k, v in c.items():
            fields[k] = fields.get(k, 0) + len(json.dumps(v, separators=(",", ":")))
    for k, n in sorted(fields.items(), key=lambda x: -x[1])[:10]:
        print(f"    contracts.{k:16s} {n/1024:6.1f} KB")

# What the contract descriptions look like after cleaning (review in the build log).
for c in (d.get("contracts") or [])[:12]:
    print(f"    {c.get('score', 0):3d} {c.get('ticker',''):5s} {c.get('award_pct') if c.get('award_pct') is not None else '-':>6}%  desc: {c.get('description','')[:80]}")
