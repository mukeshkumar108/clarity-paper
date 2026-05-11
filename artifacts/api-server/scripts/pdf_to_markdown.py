#!/usr/bin/env python3
"""Read a PDF from stdin, output markdown to stdout."""
import sys
import pymupdf
import pymupdf4llm


def main() -> None:
    pdf_bytes = sys.stdin.buffer.read()
    if not pdf_bytes:
        sys.stderr.write("No PDF data received on stdin\n")
        sys.exit(1)

    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        md = pymupdf4llm.to_markdown(
            doc,
            ignore_images=True,
            ignore_graphics=True,
            detect_bg_color=False,
            force_text=True,
        )
        sys.stdout.write(md)
    except Exception as exc:
        sys.stderr.write(f"PDF conversion failed: {exc}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
