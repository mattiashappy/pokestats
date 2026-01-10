# scripts/tradera_raw_dump.py
#
# Tradera RAW DUMP (SearchAdvanced)
# - Pulls ENDED auctions from newest -> oldest (EndDateDescending)
# - Uses ItemsPerPage=500 (Tradera max for SearchAdvanced)
# - Saves each SOAP response to /tmp on the dyno (ephemeral on Heroku)
# - Robust item counting (namespace-agnostic) so it matches real response structure
# - 429 backoff + retries so long paging runs are safer
#
# Run on Heroku:
#   heroku run python scripts/tradera_raw_dump.py -a pokestats
#
# IMPORTANT SECURITY:
# - Don’t hardcode real keys in git. If you pasted keys anywhere, rotate them.

from __future__ import annotations

import sys
import time
import requests
import xml.etree.ElementTree as ET
from collections import Counter

# =========================
# HARD-CODED CONFIG
# =========================

API_URL = "https://api.tradera.com/v3/SearchService.asmx"
SOAP_ACTION = "http://api.tradera.com/SearchAdvanced"

APP_ID = "5601"
APP_KEY = "PUT_YOUR_APP_KEY_HERE"  # <-- rotate if exposed anywhere

CATEGORY_ID = 1001337

ITEMS_PER_PAGE = 500      # Tradera max for SearchAdvanced
START_PAGE = 1            # page 1 is newest when OrderBy=EndDateDescending
MAX_PAGES = 50            # increase to go further back (e.g., 185 to fetch all)
SLEEP_MS = 150            # base delay between requests (helps avoid 429)

ITEM_TYPE = "Auction"
ITEM_STATUS = "Ended"
BIDS_MINIMUM = "1"        # "1" means only auctions with bids. Set "0" if you want all ended auctions.
ORDER_BY = "EndDateDescending"

# Retry/backoff
MAX_RETRIES = 6
BACKOFF_BASE_MS = 800     # initial wait on 429; doubles each retry

# Debug (prints structure info on page 1)
DEBUG_PAGE_1 = True
DEBUG_TOP_TAGS = 15

# =========================
# HELPERS
# =========================

def die(msg: str) -> None:
    print(msg)
    sys.exit(1)


def _localname(tag: str) -> str:
    """Strip XML namespace: '{ns}Tag' -> 'Tag'."""
    return tag.split("}", 1)[-1] if "}" in tag else tag


def build_envelope(page_number: int) -> str:
    if not APP_ID or not APP_KEY:
        die("Missing APP_ID / APP_KEY in file config")

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
        "User-Agent": "pokestats-tradera-raw-dump/1.0",
    }

    backoff_ms = BACKOFF_BASE_MS

    for attempt in range(1, MAX_RETRIES + 1):
        r = requests.post(API_URL, data=xml_body.encode("utf-8"), headers=headers, timeout=60)

        if r.status_code == 429:
            wait_s = backoff_ms / 1000.0
            print(f"429 rate limited. Retry {attempt}/{MAX_RETRIES}. Sleeping {wait_s:.2f}s…")
            time.sleep(wait_s)
            backoff_ms *= 2
            continue

        r.raise_for_status()
        return r.text

    raise RuntimeError("Too many 429 responses; aborting.")


def _find_first_by_localname(root: ET.Element, name: str) -> ET.Element | None:
    """Find first element whose localname == name, regardless of namespace."""
    for el in root.iter():
        if _localname(el.tag) == name:
            return el
    return None


def _find_all_by_localname(root: ET.Element, name: str) -> list[ET.Element]:
    """Find all elements whose localname == name, regardless of namespace."""
    return [el for el in root.iter() if _localname(el.tag) == name]


def parse_totals(xml_text: str) -> tuple[int | None, int | None]:
    """Parse TotalNumberOfItems / TotalNumberOfPages regardless of namespace."""
    root = ET.fromstring(xml_text)

    ti = _find_first_by_localname(root, "TotalNumberOfItems")
    tp = _find_first_by_localname(root, "TotalNumberOfPages")

    total_items = int(ti.text) if (ti is not None and ti.text and ti.text.isdigit()) else None
    total_pages = int(tp.text) if (tp is not None and tp.text and tp.text.isdigit()) else None

    return total_items, total_pages


def count_items(xml_text: str) -> int:
    """
    Robustly count result items for SearchAdvanced.
    Many SOAP responses wrap results like:
      <Items> <ItemSearchResult>...</ItemSearchResult> ... </Items>
    and not necessarily <Item>.
    Strategy:
      1) Locate <Items> container (localname == 'Items')
      2) Count repeated row elements under it (direct children)
         - choose the most common direct-child tag as "row"
    """
    root = ET.fromstring(xml_text)
    items_container = _find_first_by_localname(root, "Items")
    if items_container is None:
        return 0

    # Direct children under <Items> are typically the rows
    children = list(items_container)
    if not children:
        return 0

    # If there is a single wrapper child, descend one level (some APIs do <Items><ItemList>...</ItemList></Items>)
    if len(children) == 1 and len(list(children[0])) > 0:
        maybe_wrapper = children[0]
        # only treat as wrapper if it isn't obviously a row element repeated
        wrapper_children = list(maybe_wrapper)
        if wrapper_children:
            children = wrapper_children

    # Count by localname of direct children, pick the most common as the row type
    name_counts = Counter(_localname(c.tag) for c in children)
    row_name, row_count = name_counts.most_common(1)[0]
    # Row count is how many "rows" we got
    return row_count


def debug_items_structure(xml_text: str) -> None:
    """Print what tags appear under <Items> and their counts (helps verify row tag)."""
    root = ET.fromstring(xml_text)
    items_container = _find_first_by_localname(root, "Items")
    if items_container is None:
        print("DEBUG: No <Items> container found.")
        return

    # Direct children summary
    direct = list(items_container)
    if len(direct) == 1 and len(list(direct[0])) > 0:
        # might be wrapper
        direct = list(direct[0])

    direct_names = [_localname(c.tag) for c in direct]
    counts = Counter(direct_names)

    print("DEBUG: <Items> direct-child tag counts (top):")
    for name, cnt in counts.most_common(DEBUG_TOP_TAGS):
        print(f"  {name}: {cnt}")


# =========================
# MAIN
# =========================

def main() -> None:
    print(
        f"Tradera import | category={CATEGORY_ID}, items_per_page={ITEMS_PER_PAGE}, "
        f"pages={START_PAGE}→{START_PAGE + MAX_PAGES - 1}, "
        f"filters: status={ITEM_STATUS}, type={ITEM_TYPE}, bids_min={BIDS_MINIMUM}, order={ORDER_BY}"
    )

    detected_total_pages: int | None = None
    detected_total_items: int | None = None

    for page in range(START_PAGE, START_PAGE + MAX_PAGES):
        xml_req = build_envelope(page)
        xml_resp = post_soap(xml_req)

        out_path = f"/tmp/tradera_page_{page:05d}.xml"
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(xml_resp)

        total_items, total_pages = parse_totals(xml_resp)
        if detected_total_pages is None and total_pages:
            detected_total_pages = total_pages
            detected_total_items = total_items
            print(f"API totals: total_items={detected_total_items}, total_pages={detected_total_pages}")

        if DEBUG_PAGE_1 and page == START_PAGE:
            debug_items_structure(xml_resp)

        items_in_response = count_items(xml_resp)
        print(f"Page {page}: items={items_in_response}, saved={out_path}")

        if items_in_response == 0:
            print("No items returned — stopping.")
            break

        # Stop if API says we've reached the last page
        if detected_total_pages and page >= detected_total_pages:
            print("Reached last page per API totals — stopping.")
            break

        if SLEEP_MS > 0:
            time.sleep(SLEEP_MS / 1000.0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)
