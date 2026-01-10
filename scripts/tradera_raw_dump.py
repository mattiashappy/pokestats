import sys
import time
import requests
import xml.etree.ElementTree as ET

# =========================
# HARD-CODED CONFIG
# =========================

API_URL = "https://api.tradera.com/v3/SearchService.asmx"
SOAP_ACTION = "http://api.tradera.com/SearchAdvanced"

APP_ID = "5601"
APP_KEY = "f0815a17-192a-4af6-802f-4f9d6e9cf30b"
CATEGORY_ID = 1001337

ITEMS_PER_PAGE = 500      # Max throughput
START_PAGE = 1            # Always start at newest
MAX_PAGES = 50            # How far back you go (increase as needed)
SLEEP_MS = 150             # Delay between calls (avoid 429s)

ITEM_TYPE = "Auction"
ITEM_STATUS = "Ended"
BIDS_MINIMUM = "1"
ORDER_BY = "EndDateDescending"

MAX_RETRIES = 5
BACKOFF_BASE_MS = 800


# =========================
# HELPERS
# =========================

def die(msg: str):
    print(msg)
    sys.exit(1)


def build_envelope(page_number: int) -> str:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <AuthenticationHeader xmlns="http://api.tradera.com">
      <AppId>{APP_ID}</AppId>
      <AppKey>{APP_KEY}</AppKey>
    </AuthenticationHeader>
  </soap:Header>

  <soap:Body>
    <SearchAdvanced xmlns="http://api.tradera.com">
      <request>
        <CategoryId>{CATEGORY_ID}</CategoryId>
        <ItemType>{ITEM_TYPE}</ItemType>
        <ItemStatus>{ITEM_STATUS}</ItemStatus>
        <BidsMinimum>{BIDS_MINIMUM}</BidsMinimum>
        <OrderBy>{ORDER_BY}</OrderBy>
        <ItemsPerPage>{ITEMS_PER_PAGE}</ItemsPerPage>
        <PageNumber>{page_number}</PageNumber>
      </request>
    </SearchAdvanced>
  </soap:Body>
</soap:Envelope>"""


def post_soap(xml_body: str) -> str:
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": SOAP_ACTION,
        "User-Agent": "pokestats-raw-dump/1.0",
    }

    backoff_ms = BACKOFF_BASE_MS

    for attempt in range(1, MAX_RETRIES + 1):
        r = requests.post(API_URL, data=xml_body.encode("utf-8"), headers=headers, timeout=60)

        if r.status_code == 429:
            wait = backoff_ms / 1000
            print(f"429 rate limited. Retry {attempt}/{MAX_RETRIES}, sleeping {wait:.2f}s")
            time.sleep(wait)
            backoff_ms *= 2
            continue

        r.raise_for_status()
        return r.text

    raise RuntimeError("Too many 429 responses")


def parse_totals_and_items(xml_text: str):
    ns = {"t": "http://api.tradera.com"}
    root = ET.fromstring(xml_text)

    total_items = None
    total_pages = None

    ti = root.find(".//t:TotalNumberOfItems", ns)
    tp = root.find(".//t:TotalNumberOfPages", ns)

    if ti is not None and ti.text:
        total_items = int(ti.text)
    if tp is not None and tp.text:
        total_pages = int(tp.text)

    items = root.findall(".//t:Item", ns)
    return total_items, total_pages, len(items)


# =========================
# MAIN
# =========================

def main():
    print(
        f"Tradera import | category={CATEGORY_ID}, "
        f"items_per_page={ITEMS_PER_PAGE}, pages={START_PAGE}→{START_PAGE + MAX_PAGES - 1}"
    )

    detected_total_pages = None

    for page in range(START_PAGE, START_PAGE + MAX_PAGES):
        xml_req = build_envelope(page)
        xml_resp = post_soap(xml_req)

        out_path = f"/tmp/tradera_page_{page:05d}.xml"
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(xml_resp)

        total_items, total_pages, items_count = parse_totals_and_items(xml_resp)

        if detected_total_pages is None and total_pages:
            detected_total_pages = total_pages
            print(f"API totals: total_items={total_items}, total_pages={total_pages}")

        print(f"Page {page}: items={items_count}, saved={out_path}")

        if items_count == 0:
            print("No items returned — stopping.")
            break

        if detected_total_pages and page >= detected_total_pages:
            print("Reached last page.")
            break

        time.sleep(SLEEP_MS / 1000)


if __name__ == "__main__":
    main()
