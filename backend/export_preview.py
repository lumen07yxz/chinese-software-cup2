"""用 PowerPoint COM 将 PPTX 每页导出为 PNG"""
import os, sys, time

pptx_path = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "preview_transformer.pptx")
out_dir = os.path.join(os.path.dirname(pptx_path), "ppt_preview")
os.makedirs(out_dir, exist_ok=True)

import win32com.client

powerpoint = win32com.client.Dispatch("PowerPoint.Application")
powerpoint.Visible = True

try:
    presentation = powerpoint.Presentations.Open(pptx_path, WithWindow=False)
    for i, slide in enumerate(presentation.Slides, 1):
        img_path = os.path.join(out_dir, f"slide_{i}.png")
        slide.Export(img_path, "PNG", 1200, 900)
        print(f"slide {i} -> {img_path}")
    presentation.Close()
finally:
    powerpoint.Quit()

print(f"Done. {out_dir}")
