import os
import sys
import time
import requests
import xml.etree.ElementTree as ET

API_URL = "https://api.tradera.com/v3/SearchService.asmx"
SOAP_ACTION = "http://api.tradera.com/SearchAdvanced"

APP_ID = os.getenv("TRADERA_APP_ID")
APP_KEY = os.getenv("TRADERA_APP_KEY")
CATEGORY_ID = int(os.getenv("TRADERA_CATEGORY_ID", "1001337"))
ITEMS_PER_PAGE = int(os.getenv("ITEMS_PER_PAGE", "500"))
START_PAGE = int(os.getenv("START_PAGE", "1"))
MAX_PAGES = int(os.getenv("MAX_PAGES", "5"))  # set to 200 later if you want all
SLEEP_MS = int(os.getenv("SLEEP_MS", "150"))

# If you truly want "no filtering", set these empty via config vars:
ITEM_STATUS = os.getenv("ITEM_STATUS", "Ended")  # set "" to remove element
ITEM_TYPE = os.getenv("ITEM_TYPE", "Auction")    # set "" to remove element
BIDS_MINIMUM = os.getenv("BIDS_MINIMUM", "1")    # set "0" to remove sold-only

ORDER_BY = os.getenv("ORDER_BY", "EndDateDescending")


def die(msg: str):
    print(msg)
    sys.exit(1)


def build_envelope(page_number: int) -> str:
    if not APP_ID or not APP_KEY:
        die("Missing TRADERA_APP_ID or TRADERA_APP_KEY in env vars")

    # Build request XML that mirrors your Postman structure closely.
    # Optional elements are included only when non-empty.
    item_status_xml = f"<ItemStatus>{ITEM_STATUS}</ItemStatus>" if ITEM_STATUS else ""
    item_type_xml = f"<ItemType>{ITEM_TYPE}</ItemType>" if ITEM_TYPE else ""
    bids_min_xml = f"<BidsMinimum>{BIDS_MINIMUM}</BidsMinimum>" if BIDS_MINIMUM else ""

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
        {item_type_xml}
        {item_status_xml}
        {bids_min_xml}
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
    r = requests.post(API_URL, data=xml_body.encode("utf-8"), headers=headers, timeout=60)
    r.raise_for_status()
    return r.text


def parse_totals_and_itemcount(xml_text: str):
    # Namespaces
    ns = {
        "soap": "http://schemas.xmlsoap.org/soap/envelope/",
        "t": "http://api.tradera.com",
    }
    root = ET.fromstring(xml_text)

    total_items = None
    total_pages = None
    items_count = 0

    total_items_el = root.find(".//t:TotalNumberOfItems", ns)
    total_pages_el = root.find(".//t:TotalNumberOfPages", ns)
    if total_items_el is not None and total_items_el.text:
        total_items = int(total_items_el.text)
    if total_pages_el is not None and total_pages_el.text:
        total_pages = int(total_pages_el.text)

    # In your response, <Items> repeats. Count them.
    items = root.findall(".//t:Items", ns)
    items_count = len(items)

    return total_items, total_pages, items_count


def main():
    print(
        f"RAW DUMP: category={CATEGORY_ID}, items_per_page={ITEMS_PER_PAGE}, "
        f"start_page={START_PAGE}, max_pages={MAX_PAGES}, "
        f"item_type={ITEM_TYPE!r}, item_status={ITEM_STATUS!r}, bids_min={BIDS_MINIMUM!r}"
    )

    detected_total_pages = None

    for page in range(START_PAGE, START_PAGE + MAX_PAGES):
        xml_req = build_envelope(page)
        xml_resp = post_soap(xml_req)

        # Save raw response so you can inspect it
        out_path = f"/tmp/tradera_page_{page:03d}.xml"
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(xml_resp)

        total_items, total_pages, items_count = parse_totals_and_itemcount(xml_resp)

        if detected_total_pages is None and total_pages:
            detected_total_pages = total_pages
            print(f"API totals: total_items={total_items}, total_pages={total_pages}")

        print(f"Page {page}: saved {out_path}, items_in_response={items_count}")

        # Stop early if we reached the API's last page
        if detected_total_pages and page >= detected_total_pages:
            print("Reached last page per API totals.")
            break

        if SLEEP_MS > 0:
            time.sleep(SLEEP_MS / 1000.0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)
