import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
import xml.etree.ElementTree as ET

import psycopg2
from psycopg2.extras import Json

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "tradera-xml"


def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def find_text(element: ET.Element, name: str) -> Optional[str]:
    for child in element.iter():
        if strip_ns(child.tag) == name and child.text and child.text.strip():
            return child.text.strip()
    return None


def parse_int(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def normalize_string(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def parse_image_urls(item: ET.Element) -> Optional[List[str]]:
    urls = []
    for link in item.iter():
        if strip_ns(link.tag) == "Url" and link.text and link.text.strip():
            urls.append(link.text.strip())
    return urls or None


def parse_attributes(item: ET.Element) -> Dict[str, Optional[str]]:
    attributes: Dict[str, Optional[str]] = {}
    for term_value in item.iter():
        if strip_ns(term_value.tag) != "TermAttributeValue":
            continue
        name = find_text(term_value, "Name")
        value = None
        values_node = None
        for child in term_value:
            if strip_ns(child.tag) == "Values":
                values_node = child
                break
        if values_node is not None:
            for value_node in values_node:
                if value_node.text and value_node.text.strip():
                    value = value_node.text.strip()
                    break
        if name:
            attributes[name] = value
    return attributes


def iter_items(root: ET.Element) -> Iterable[ET.Element]:
    for node in root.iter():
        if strip_ns(node.tag) != "Items":
            continue
        if find_text(node, "Id"):  # only treat as an item record if it has an Id inside
            yield node


def map_item(item: ET.Element) -> Optional[Dict[str, Any]]:
    item_id = parse_int(find_text(item, "Id"))
    category_id = parse_int(find_text(item, "CategoryId"))
    end_date = normalize_string(find_text(item, "EndDate"))

    if not item_id or not category_id or not end_date:
        return None

    attributes = parse_attributes(item)

    return {
        "item_id": item_id,
        "category_id": category_id,
        "end_date": end_date,
        "price": parse_int(find_text(item, "MaxBid")) or parse_int(find_text(item, "BuyItNowPrice")),
        "bid_count": parse_int(find_text(item, "BidCount")),
        "seller_id": parse_int(find_text(item, "SellerId")),
        "seller_alias": normalize_string(find_text(item, "SellerAlias")),
        "title": normalize_string(find_text(item, "ShortDescription")),
        "item_url": normalize_string(find_text(item, "ItemUrl")),
        "thumbnail_url": normalize_string(find_text(item, "ThumbnailLink")),
        "tradera_attributes": attributes or None,
        "image_urls": parse_image_urls(item),
        "description": normalize_string(find_text(item, "LongDescription")),
        "item_condition": attributes.get("condition"),
        "pokemon_era": attributes.get("pokemon_era"),
        "pokemon_language": attributes.get("pokemon_language"),
        "raw": None,
    }


def read_xml_file(file_path: Path) -> ET.Element:
    tree = ET.parse(file_path)
    return tree.getroot()


def list_xml_files(directory: Path) -> List[Path]:
    if not directory.exists():
        return []
    return sorted(path for path in directory.iterdir() if path.suffix.lower() == ".xml")


def import_auctions() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL not set")

    files = list_xml_files(DATA_DIR)
    if not files:
        print("No XML files found in data/tradera-xml")
        return

    summary = {
        "files": len(files),
        "received": 0,
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
        "errors": [],
    }

    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cursor:
            for file_path in files:
                root = read_xml_file(file_path)
                for index, item in enumerate(iter_items(root)):
                    summary["received"] += 1
                    mapped = map_item(item)
                    if not mapped:
                        summary["skipped"] += 1
                        if len(summary["errors"]) < 20:
                            summary["errors"].append(
                                {
                                    "file": file_path.name,
                                    "index": index,
                                    "reason": "missing_required_fields",
                                }
                            )
                        continue

                    mapped["raw"] = Json({"xml_file": file_path.name, "item_id": mapped["item_id"]})

                    cursor.execute(
                        """
                        INSERT INTO public.tradera_auctions (
                            item_id,
                            category_id,
                            end_date,
                            price,
                            bid_count,
                            seller_id,
                            seller_alias,
                            title,
                            item_url,
                            thumbnail_url,
                            tradera_attributes,
                            image_urls,
                            description,
                            item_condition,
                            pokemon_era,
                            pokemon_language,
                            raw,
                            updated_at
                        )
                        VALUES (
                            %(item_id)s,
                            %(category_id)s,
                            %(end_date)s,
                            %(price)s,
                            %(bid_count)s,
                            %(seller_id)s,
                            %(seller_alias)s,
                            %(title)s,
                            %(item_url)s,
                            %(thumbnail_url)s,
                            %(tradera_attributes)s,
                            %(image_urls)s,
                            %(description)s,
                            %(item_condition)s,
                            %(pokemon_era)s,
                            %(pokemon_language)s,
                            %(raw)s,
                            now()
                        )
                        ON CONFLICT (item_id)
                        DO UPDATE SET
                            category_id = EXCLUDED.category_id,
                            end_date = EXCLUDED.end_date,
                            price = EXCLUDED.price,
                            bid_count = EXCLUDED.bid_count,
                            seller_id = EXCLUDED.seller_id,
                            seller_alias = EXCLUDED.seller_alias,
                            title = EXCLUDED.title,
                            item_url = EXCLUDED.item_url,
                            thumbnail_url = EXCLUDED.thumbnail_url,
                            tradera_attributes = EXCLUDED.tradera_attributes,
                            image_urls = EXCLUDED.image_urls,
                            description = EXCLUDED.description,
                            item_condition = EXCLUDED.item_condition,
                            pokemon_era = EXCLUDED.pokemon_era,
                            pokemon_language = EXCLUDED.pokemon_language,
                            raw = EXCLUDED.raw,
                            updated_at = now()
                        RETURNING (xmax = 0) AS inserted;
                        """,
                        mapped,
                    )
                    inserted = cursor.fetchone()[0]
                    if inserted:
                        summary["inserted"] += 1
                    else:
                        summary["updated"] += 1

    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        import_auctions()
    except Exception as exc:
        print(f"Failed to import tradera XML auctions: {exc}")
        raise
