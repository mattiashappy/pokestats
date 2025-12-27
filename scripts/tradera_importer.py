"""Daily importer for sold Pokémon card auctions from Tradera.

This script is designed to run from Heroku Scheduler at 02:00 local time
(Europe/Stockholm). It fetches ended auctions with at least one bid from
Tradera's SOAP SearchService v3 and upserts them into PostgreSQL. The importer
is intentionally idempotent so reruns for the same day are safe.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional

import psycopg2
from dateutil import parser as date_parser
import pytz
import requests
from psycopg2.extras import Json, execute_batch
from zeep import Client, Settings, helpers
from zeep.transports import Transport

# --- Configuration constants ---
WSDL_URL = "https://api.tradera.com/v3/SearchService.asmx?WSDL"
CATEGORY_ID = 1001337  # Pokémon cards -> Singles
ITEMS_PER_PAGE = 500
MAX_API_CALLS_PER_DAY = 100  # upper bound enforced via pagination guard
DEFAULT_TIMEZONE = os.getenv("LOCAL_TIMEZONE", "Europe/Stockholm")


@dataclass
class TraderaItem:
    """Normalized representation of a Tradera auction result."""

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
    """Thin SOAP client wrapper around SearchService.SearchAdvanced."""

    def __init__(self, app_id: str, app_key: str, timeout: int = 30) -> None:
        self.app_id = app_id
        self.app_key = app_key
        session = requests.Session()
        session.headers.update({"User-Agent": "pokestats-importer/1.0"})
        transport = Transport(session=session, timeout=timeout)
        settings = Settings(strict=False)  # Be forgiving: API sometimes omits empty fields.
        self.client = Client(WSDL_URL, transport=transport, settings=settings)

    def search_page(self, page_number: int) -> dict:
        """Fetch one search page sorted by end date descending.

        The request mirrors the API filters described in the business rules.
        """
        search_request = {
            "CategoryId": CATEGORY_ID,
            "ItemType": "Auction",
            "ItemStatus": "Ended",
            "OrderBy": "EndDateDescending",
            "BidsMinimum": 1,
            "PageNumber": page_number,
            "ItemsPerPage": ITEMS_PER_PAGE,
        }

        soap_headers = {"AppId": self.app_id, "AppKey": self.app_key}
        response = self.client.service.SearchAdvanced(
            search_request, _soapheaders=soap_headers
        )
        return helpers.serialize_object(response, target_cls=dict)


def _ensure_list(value) -> List:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def parse_attributes(raw_attributes: Optional[dict]) -> Dict[str, List[str]]:
    """Convert Tradera attribute list to {name: [values]} mapping."""
    if not raw_attributes:
        return {}

    attributes: Dict[str, List[str]] = {}
    raw_list = raw_attributes.get("Attribute") or []
    for attribute in _ensure_list(raw_list):
        name = attribute.get("Name")
        values = _ensure_list(attribute.get("Values", {}).get("string"))
        if name:
            attributes[name] = [str(v) for v in values if v is not None]
    return attributes


def parse_image_links(raw_images: Optional[dict]) -> List[str]:
    """Extract image URLs into a plain list."""
    if not raw_images:
        return []
    urls = raw_images.get("string")
    return [str(u) for u in _ensure_list(urls) if u]


def parse_tradera_item(raw_item: dict) -> TraderaItem:
    end_date = date_parser.isoparse(str(raw_item.get("EndDate"))).astimezone(pytz.UTC)
    attributes = parse_attributes(raw_item.get("Attributes"))
    image_urls = parse_image_links(raw_item.get("ImageLinks"))

    seller = raw_item.get("Seller") or {}
    return TraderaItem(
        item_id=int(raw_item.get("Id")),
        category_id=int(raw_item.get("CategoryId")),
        end_date=end_date,
        price=int(raw_item.get("MaxBid")) if raw_item.get("MaxBid") is not None else None,
        bid_count=int(raw_item.get("BidCount")) if raw_item.get("BidCount") is not None else None,
        seller_id=int(seller.get("Id")) if seller.get("Id") is not None else None,
        seller_alias=seller.get("Alias"),
        seller_dsr=float(seller.get("DSR")) if seller.get("DSR") is not None else None,
        title=raw_item.get("ShortDescription"),
        description=raw_item.get("LongDescription"),
        item_url=raw_item.get("ItemUrl") or raw_item.get("ItemURL"),
        thumbnail_url=raw_item.get("ThumbnailLink"),
        image_urls=image_urls,
        attributes=attributes,
    )


def load_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable {name}")
    return value


def calculate_yesterday_window(tz_name: str = DEFAULT_TIMEZONE) -> tuple[datetime, datetime]:
    tz = pytz.timezone(tz_name)
    now_local = datetime.now(tz)
    yesterday_start = (now_local - timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    yesterday_end = yesterday_start + timedelta(days=1)
    return yesterday_start, yesterday_end


def filter_items_for_yesterday(items: Iterable[TraderaItem], tz_name: str) -> List[TraderaItem]:
    tz = pytz.timezone(tz_name)
    yesterday_start, yesterday_end = calculate_yesterday_window(tz_name)

    filtered: List[TraderaItem] = []
    for item in items:
        end_local = item.end_date.astimezone(tz)
        if end_local >= yesterday_end:
            # Ignore auctions that ended today; they will be picked up tomorrow.
            continue
        if end_local < yesterday_start:
            # Older than yesterday -> used for pagination stop elsewhere.
            continue
        filtered.append(item)
    return filtered


def should_stop_pagination(items: Iterable[TraderaItem], tz_name: str) -> bool:
    tz = pytz.timezone(tz_name)
    yesterday_start, _ = calculate_yesterday_window(tz_name)
    for item in items:
        end_local = item.end_date.astimezone(tz)
        if end_local < yesterday_start:
            return True
    return False


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


def log(msg: str) -> None:
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def run_import() -> None:
    app_id = load_env("TRADERA_APP_ID")
    app_key = load_env("TRADERA_APP_KEY")
    database_url = load_env("DATABASE_URL")
    max_pages = int(os.getenv("MAX_PAGES", str(MAX_API_CALLS_PER_DAY)))
    tz_name = DEFAULT_TIMEZONE

    client = TraderaClient(app_id, app_key)

    yesterday_start, yesterday_end = calculate_yesterday_window(tz_name)
    log(
        f"Importing sold auctions between {yesterday_start.isoformat()} and {yesterday_end.isoformat()} ({tz_name})"
    )

    pages_fetched = 0
    items_scanned = 0
    items_imported = 0

    stop = False
    page_number = 1

    with psycopg2.connect(database_url) as conn:
        while not stop and page_number <= max_pages:
            response = client.search_page(page_number)
            pages_fetched += 1

            result_items = (((response or {}).get("SearchAdvancedResult") or {}).get("Items") or {}).get(
                "SearchItem"
            )
            raw_items = _ensure_list(result_items)

            if not raw_items:
                log(f"No items returned on page {page_number}; stopping pagination.")
                break

            parsed_items = [parse_tradera_item(item) for item in raw_items]
            items_scanned += len(parsed_items)

            if should_stop_pagination(parsed_items, tz_name):
                stop = True

            filtered_items = filter_items_for_yesterday(parsed_items, tz_name)
            upsert_items(conn, filtered_items)
            items_imported += len(filtered_items)

            log(
                f"Page {page_number}: scanned {len(parsed_items)} items, imported {len(filtered_items)}"
            )

            if stop:
                log(
                    "Detected items older than yesterday's window; stopping pagination after current page."
                )
                break

            page_number += 1

    log(
        f"Finished. Pages fetched: {pages_fetched}, items scanned: {items_scanned}, items imported: {items_imported}"
    )


def main() -> None:
    try:
        run_import()
    except Exception as exc:  # noqa: BLE001 - we want visible failures in scheduler logs
        log(f"Import failed: {exc}")
        raise


if __name__ == "__main__":
    main()
