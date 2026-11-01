import datetime as dt, os
from radar import reaction
ua = os.environ["SEC_USER_AGENT"]; today = dt.date.today()
for name in ["Honeywell International Inc.", "HONEYWELL", "Honeywell", "Fluor Corporation", "FLUOR",
             "Accenture plc", "ACCENTURE", "L3Harris Technologies, Inc.", "L3HARRIS", "Medline Industries, Lp"]:
    try:
        n = len(reaction.fetch_awards(name, ua, years=3, min_amount=25e6, today=today, max_pages=1))
    except Exception as e:
        n = f"ERR {type(e).__name__}"
    print(f"{name!r}: {n}")
