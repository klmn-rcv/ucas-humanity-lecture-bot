#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import ddddocr


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run ddddocr against one or more captcha images and emit JSON."
    )
    parser.add_argument("images", nargs="+", help="Captcha image paths to classify")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ocr = ddddocr.DdddOcr(show_ad=False)
    results: list[dict[str, str]] = []

    for image_arg in args.images:
        image_path = Path(image_arg).resolve()
        results.append(
            {
                "image": str(image_path),
                "text": ocr.classification(image_path.read_bytes()),
            }
        )

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
