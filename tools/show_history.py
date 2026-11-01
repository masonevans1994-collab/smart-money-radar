import json, sys
d = json.load(open(sys.argv[1]))
for c in d["contracts"]:
    h = c.get("history")
    print(c["ticker"], "|", (h or {}).get("closest") and f"closest ${h['closest']['value']/1e6:.0f}M {h['closest']['date']} d30={h['closest']['d30']}" or "no history")
