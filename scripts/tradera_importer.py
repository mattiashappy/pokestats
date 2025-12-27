"""
Tradera importer with SOAP request/response debug (TEMP).

Purpose:
- Print the exact SOAP XML that Zeep sends from Heroku
- Print the first part of the raw SOAP response

After debugging, remove DEBUG_SOAP or set it to 0.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional, Tuple

import psycopg2
import pytz
import requests
from dateutil import parser as date_parser
from psycopg2.extras import Json, execute_batch
from zeep import Client, Settings, helpers
from zeep.transports import Transport

WSDL_URL = "https://api.tradera.com/v3/SearchService.asmx?WSDL"

CATEGORY_ID = int(os.getenv("TRADERA_CATEGORY_ID", "1001337"))
ITEMS_PER_PAGE = int(os.getenv("ITEMS_PER_PAGE", "500"))
MAX_PAGES = int(os.getenv("MAX_PAGES", "5"))  # keep low while debugging
BIDS_MINIMUM = int(os.getenv("BIDS_MINIMUM", "1"))

DEFAULT_TIMEZONE = os.getenv("TZ") or os.getenv("LOCAL_TIMEZONE") or "Europe/Stockholm"
DEBUG_SOAP = os.getenv("DEBUG_SOAP", "1") == "1"


def log(msg: str) -> None:
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def load_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable {name}")
    return value


def load_tradera_credentials() -> tuple[str, str]:
    app_id = os.getenv("TRADERA_APP_ID") or os.getenv("HEROKU_TRADERA_APP_ID")
    app_key = os.getenv("TRADERA_APP_KEY") or os.getenv("HEROKU_TRADERA_APP_KEY")

    missing = []
    if not app_id:
        missing.append("TRADERA_APP_ID")
    if not app_key:
        missing.append("TRADERA_APP_KEY")
    if missing:
        raise RuntimeError("Missing required environment variable(s): " + ", ".join(missing))

    return app_id.strip(), app_key.strip()


def _ensure_list(value) -> List:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


@dataclass
class TraderaItem:
    item_id: int
    category_id: int
    end_date: datetime
    price: Optional[int]
    bid_count: Optional[int]
    seller_id: Optional[int]
    seller_alias: Optional[str]
    seller_dsr: Optional[float]
    title: Optional[str]
    description: Optional[str]
    item_url: Optional[str]
    thumbnail_url: Optional[str]
    image_urls: List[str]
    attributes: Dict[str, List[str]]

    @property
    def as_db_params(self) -> Dict[str, object]:
        return {
            "item_id": self.item_id,
            "category_id": self.category_id,
            "end_date": self.end_date,
            "price": self.price,
            "bid_count": self.bid_count,
            "seller_id": self.seller_id,
            "seller_alias": self.seller_alias,
            "seller_dsr": self.seller_dsr,
            "title": self.title,
            "description": self.description,
            "item_url": self.item_url,
            "thumbnail_url": self.thumbnail_url,
            "image_urls": Json(self.image_urls),
            "attributes": Json(self.attributes),
        }


class TraderaClient:
    def __init__(self, app_id: str, app_key: str, timeout: int = 45) -> None:
        self.app_id = str(app_id).strip()
        self.app_key = str(app_key).strip()

        session = requests.Session()
        session.headers.update({"User-Agent": "pokestats-importer/1.0"})
        transport = Transport(session=session, timeout=timeout)

        # Important: strict=False helps, but we still want raw messages
        settings = Settings(strict=False)

        self.client = Client(WSDL_URL, transport=transport, settings=settings)

        # Correct header element + namespace
        from zeep import xsd

        self.auth_header_el = xsd.Element(
            "{http://api.tradera.com}AuthenticationHeader",
            xsd.ComplexType(
                [
                    xsd.Element("{http://api.tradera.com}AppId", xsd.String()),
                    xsd.Element("{http://api.tradera.com}AppKey", xsd.String()),
                ]
            ),
        )

    def search_page(self, page_number: int) -> tuple[dict, str, str]:
        """
        Returns: (parsed_response_dict, last_sent_xml, last_received_xml)
        """
        # Build request: try to mimic Postman behavior: DO NOT filter keywords at all.
        # We'll send SearchWords as None (xsi:nil) because WSDL may require the element.
        search_request = {
            "CategoryId": CATEGORY_ID,
            "ItemType": "Auction",
            "ItemStatus": "Ended",
            "OrderBy": "EndDateDescending",
            "BidsMinimum": BIDS_MINIMUM,
            "PageNumber": page_number,
            "ItemsPerPage": ITEMS_PER_PAGE,

            # WSDL-required defaults seen earlier
            "SearchInDescription": False,
            "CountyId": 0,
            "OnlyAuctionsWithBuyNow": False,
            "OnlyItemsWithThumbnail": False,

            # Avoid empty-string search
            "SearchWords": None,
        }

        auth_header = self.auth_header_el(AppId=self.app_id, AppKey=self.app_key)

        # Send request
        response = self.client.service.SearchAdvanced(
            search_request,
            _soapheaders=[auth_header],
        )

        # Grab raw XML from zeep's transport history (if available)
        sent_xml = ""
        recv_xml = ""
        try:
            # Zeep keeps history if transport has a HistoryPlugin — we didn't add it.
            # But requests session doesn't store it. So we re-run with a HistoryPlugin via settings.
            pass
        except Exception:
            pass

        # Alternative: use zeep.plugins.HistoryPlugin properly (below in a second client)
        return helpers.serialize_object(response, target_cls=dict), sent_xml, recv_xml


def calculate_yesterday_window(tz_name: str = DEFAULT_TIMEZONE) -> Tuple[datetime, datetime]:
    tz = pytz.timezone(tz_name)
    now_local = datetime.now(tz)
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    yesterday_end = today_start
    return yesterday_start, yesterday_end


def extract_raw_items(response: dict) -> List[dict]:
    result = (response or {}).get("SearchAdvancedResult") or {}
    # Log totals if present
    total = result.get("TotalNumberOfItems")
    pages = result.get("TotalNumberOfPages")
    if total is not None or pages is not None:
        log(f"Totals: TotalNumberOfItems={total}, TotalNumberOfPages={pages}")

    items_blob = result.get("Items")

    # Postman shows repeated <Items> nodes: zeep often returns list[dict] here.
    if isinstance(items_blob, list):
        return [x for x in items_blob if isinstance(x, dict)]

    if isinstance(items_blob, dict):
        candidates = items_blob.get("SearchItem") or items_blob.get("Item") or items_blob.get("Items")
        raw = _ensure_list(candidates)
        return [x for x in raw if isinstance(x, dict)]

    return []


def parse_tradera_item(raw_item: dict) -> TraderaItem:
    end_date = date_parser.isoparse(str(raw_item.get("EndDate"))).astimezone(pytz.UTC)

    # ImageLinks in Postman is complex; just keep empty if not simple
    image_urls: List[str] = []

    return TraderaItem(
        item_id=int(raw_item.get("Id")),
        category_id=int(raw_item.get("CategoryId")),
        end_date=end_date,
        price=int(raw_item.get("MaxBid")) if raw_item.get("MaxBid") is not None else None,
        bid_count=int(raw_item.get("BidCount")) if raw_item.get("BidCount") is not None else None,
        seller_id=int(raw_item.get("SellerId")) if raw_item.get("SellerId") is not None else None,
        seller_alias=raw_item.get("SellerAlias"),
        seller_dsr=float(raw_item.get("SellerDsrAverage")) if raw_item.get("SellerDsrAverage") is not None else None,
        title=raw_item.get("ShortDescription"),
        description=raw_item.get("LongDescription"),
        item_url=raw_item.get("ItemUrl") or raw_item.get("ItemURL"),
        thumbnail_url=raw_item.get("ThumbnailLink"),
        image_urls=image_urls,
        attributes={},
    )


def filter_items_for_yesterday(items: Iterable[TraderaItem], tz_name: str) -> List[TraderaItem]:
    tz = pytz.timezone(tz_name)
    start, end = calculate_yesterday_window(tz_name)
    return [i for i in items if start <= i.end_date.astimezone(tz) < end]


def upsert_items(conn, items: List[TraderaItem]) -> None:
    if not items:
        return

    sql = """
    INSERT INTO tradera_sales (
        item_id, category_id, end_date, price, bid_count, seller_id, seller_alias,
        seller_dsr, title, description, item_url, thumbnail_url, image_urls, attributes
    ) VALUES (
        %(item_id)s, %(category_id)s, %(end_date)s, %(price)s, %(bid_count)s,
        %(seller_id)s, %(seller_alias)s, %(seller_dsr)s, %(title)s, %(description)s,
        %(item_url)s, %(thumbnail_url)s, %(image_urls)s, %(attributes)s
    )
    ON CONFLICT (item_id) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        end_date = EXCLUDED.end_date,
        price = EXCLUDED.price,
        bid_count = EXCLUDED.bid_count,
        seller_id = EXCLUDED.seller_id,
        seller_alias = EXCLUDED.seller_alias,
        seller_dsr = EXCLUDED.seller_dsr,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        item_url = EXCLUDED.item_url,
        thumbnail_url = EXCLUDED.thumbnail_url,
        image_urls = EXCLUDED.image_urls,
        attributes = EXCLUDED.attributes;
    """
    with conn.cursor() as cur:
        execute_batch(cur, sql, [item.as_db_params for item in items], page_size=200)
    conn.commit()


def run_import() -> None:
    app_id, app_key = load_tradera_credentials()
    database_url = load_env("DATABASE_URL")
    tz_name = DEFAULT_TIMEZONE

    yesterday_start, yesterday_end = calculate_yesterday_window(tz_name)
    log(f"Importing auctions ended between {yesterday_start.isoformat()} and {yesterday_end.isoformat()} ({tz_name})")
    log(f"CategoryId={CATEGORY_ID}, ItemsPerPage={ITEMS_PER_PAGE}, MaxPages={MAX_PAGES}, BidsMinimum={BIDS_MINIMUM}")

    # --- Use Zeep HistoryPlugin to capture raw XML ---
    from zeep.plugins import HistoryPlugin
    history = HistoryPlugin()

    session = requests.Session()
    session.headers.update({"User-Agent": "pokestats-importer/1.0"})
    transport = Transport(session=session, timeout=45)

    client = Client(WSDL_URL, transport=transport, settings=Settings(strict=False), plugins=[history])

    from zeep import xsd
    auth_header_el = xsd.Element(
        "{http://api.tradera.com}AuthenticationHeader",
        xsd.ComplexType(
            [
                xsd.Element("{http://api.tradera.com}AppId", xsd.String()),
                xsd.Element("{http://api.tradera.com}AppKey", xsd.String()),
            ]
        ),
    )
    auth_header = auth_header_el(AppId=app_id, AppKey=app_key)

    pages_fetched = 0
    items_scanned = 0
    items_imported = 0

    with psycopg2.connect(database_url) as conn:
        for page_number in range(1, MAX_PAGES + 1):
            # Build request (same as before)
            search_request = {
                "CategoryId": CATEGORY_ID,
                "ItemType": "Auction",
                "ItemStatus": "Ended",
                "OrderBy": "EndDateDescending",
                "BidsMinimum": BIDS_MINIMUM,
                "PageNumber": page_number,
                "ItemsPerPage": ITEMS_PER_PAGE,

                "SearchInDescription": False,
                "CountyId": 0,
                "OnlyAuctionsWithBuyNow": False,
                "OnlyItemsWithThumbnail": False,

                "SearchWords": None,
            }

            resp_obj = client.service.SearchAdvanced(search_request, _soapheaders=[auth_header])
            pages_fetched += 1

            # DEBUG: print raw request/response XML for page 1 only
            if DEBUG_SOAP and page_number == 1:
                try:
                    sent = history.last_sent["envelope"].decode("utf-8", errors="replace")
                    recv = history.last_received["envelope"].decode("utf-8", errors="replace")
                    log("\n----- SOAP REQUEST (page 1) -----\n" + sent[:6000])
                    log("\n----- SOAP RESPONSE (page 1, first 6000 chars) -----\n" + recv[:6000])
                except Exception as e:
                    log(f"Could not print SOAP history: {e}")

            response = helpers.serialize_object(resp_obj, target_cls=dict)
            raw_items = extract_raw_items(response)

            if not raw_items:
                log(f"No items returned on page {page_number}; stopping pagination.")
                break

            parsed_items = [parse_tradera_item(item) for item in raw_items]
            items_scanned += len(parsed_items)

            filtered = filter_items_for_yesterday(parsed_items, tz_name)
            upsert_items(conn, filtered)
            items_imported += len(filtered)

            log(f"Page {page_number}: scanned {len(parsed_items)} items, imported {len(filtered)}")

    log(f"Finished. Pages fetched: {pages_fetched}, items scanned: {items_scanned}, items imported: {items_imported}")


def main() -> None:
    try:
        run_import()
        sys.exit(0)
    except Exception as exc:
        log(f"Import failed: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
