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
