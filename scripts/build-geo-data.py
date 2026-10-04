#!/usr/bin/env python3
"""Build Waysake's compact offline GeoNames index from the official GeoNames dumps."""

import argparse
import csv
import gzip
import json
import zipfile
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument("--cities", required=True, help="GeoNames cities1000.zip")
parser.add_argument("--countries", required=True, help="GeoNames countryInfo.txt")
parser.add_argument("--admin1", required=True, help="GeoNames admin1CodesASCII.txt")
parser.add_argument("--output", default="server/data/geonames-index.json.gz")
args = parser.parse_args()

countries = {}
with open(args.countries, encoding="utf-8") as source:
    for row in csv.reader((line for line in source if not line.startswith("#")), delimiter="\t"):
        if len(row) > 4:
            countries[row[0]] = {"isoNumeric": row[2], "name": row[4]}

regions = {}
with open(args.admin1, encoding="utf-8") as source:
    for row in csv.reader(source, delimiter="\t"):
        if len(row) > 1:
            regions[row[0]] = row[1]

places = []
with zipfile.ZipFile(args.cities) as archive:
    with archive.open("cities1000.txt") as raw:
        for row in csv.reader((line.decode("utf-8") for line in raw), delimiter="\t"):
            if len(row) < 15 or row[6] != "P":
                continue
            try:
                places.append([row[1], float(row[4]), float(row[5]), row[8], row[10], int(row[14] or "0")])
            except ValueError:
                continue

payload = json.dumps({"countries": countries, "regions": regions, "places": places}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
with gzip.open(output, "wb", compresslevel=9) as destination:
    destination.write(payload)
print(f"{len(places):,} populated places → {output} ({output.stat().st_size / 1024 / 1024:.1f} MiB)")
