from collections import deque
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "assets" / "resources" / "art"


def luminance(pixel: tuple[int, int, int, int]) -> float:
    return pixel[0] * 0.299 + pixel[1] * 0.587 + pixel[2] * 0.114


def component_mask(image: Image.Image, boxes: list[tuple[int, int, int, int]], threshold: int = 198) -> set[tuple[int, int]]:
    pixels = image.load()
    candidates: set[tuple[int, int]] = set()
    for left, top, right, bottom in boxes:
        for y in range(top, bottom):
            for x in range(left, right):
                if pixels[x, y][3] > 0 and luminance(pixels[x, y]) < threshold:
                    candidates.add((x, y))

    kept: set[tuple[int, int]] = set()
    while candidates:
        start = candidates.pop()
        queue = deque([start])
        component = {start}
        while queue:
            x, y = queue.popleft()
            for point in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if point in candidates:
                    candidates.remove(point)
                    component.add(point)
                    queue.append(point)
        if len(component) >= 10:
            kept.update(component)
    return kept


def expand(mask: set[tuple[int, int]], width: int, height: int, radius: int = 2) -> set[tuple[int, int]]:
    return {
        (x + dx, y + dy)
        for x, y in mask
        for dx in range(-radius, radius + 1)
        for dy in range(-radius, radius + 1)
        if 0 <= x + dx < width and 0 <= y + dy < height
    }


def inpaint(image: Image.Image, mask: set[tuple[int, int]]) -> Image.Image:
    result = image.copy()
    pixels = result.load()
    for y in range(result.height):
        samples = [
            pixels[x, y]
            for x in range(8, result.width - 8)
            if (x, y) not in mask and pixels[x, y][3] > 0 and luminance(pixels[x, y]) >= 198
        ]
        if not samples:
            continue
        color = tuple(sorted(pixel[channel] for pixel in samples)[len(samples) // 2] for channel in range(4))
        for x in range(result.width):
            if (x, y) in mask:
                pixels[x, y] = color
    return result


def remake(source_name: str, boxes: list[tuple[int, int, int, int]]) -> None:
    base = Image.open(ART / "button-next.png").convert("RGBA")
    source = Image.open(ART / source_name).convert("RGBA")
    base_foreground = component_mask(base, [(20, 35, 300, 125)])
    cleaned = inpaint(base, expand(base_foreground, base.width, base.height, 2))

    foreground = component_mask(source, boxes)
    output = cleaned.copy()
    output_pixels = output.load()
    source_pixels = source.load()
    for x, y in foreground:
        output_pixels[x, y] = source_pixels[x, y]

    output.save(ART / source_name, optimize=True)


remake("button-last.png", [(18, 45, 90, 125), (100, 35, 300, 125)])
remake("button-undo.png", [(18, 40, 92, 132), (92, 35, 300, 132)])


def sync_sprite_geometry(target_name: str) -> None:
    source_meta = json.loads((ART / "button-next.png.meta").read_text(encoding="utf-8"))
    target_path = ART / f"{target_name}.png.meta"
    target_meta = json.loads(target_path.read_text(encoding="utf-8"))
    source_data = source_meta["subMetas"]["f9941"]["userData"]
    target_data = target_meta["subMetas"]["f9941"]["userData"]
    image_reference = target_data["imageUuidOrDatabaseUri"]
    atlas_reference = target_data.get("atlasUuid", "")
    target_meta["subMetas"]["f9941"]["userData"] = json.loads(json.dumps(source_data))
    target_meta["subMetas"]["f9941"]["userData"]["imageUuidOrDatabaseUri"] = image_reference
    target_meta["subMetas"]["f9941"]["userData"]["atlasUuid"] = atlas_reference
    target_path.write_text(json.dumps(target_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


sync_sprite_geometry("button-last")
sync_sprite_geometry("button-undo")
