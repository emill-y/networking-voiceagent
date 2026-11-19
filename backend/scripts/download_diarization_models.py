"""Download the two small models voice differentiation needs (about 46 MB).

    python -m scripts.download_diarization_models

Both come from the sherpa-onnx project's GitHub releases
(https://github.com/k2-fsa/sherpa-onnx):

- segmentation.onnx: pyannote segmentation 3.0. Finds where speech is and
  where one voice stops and another starts.
- embedding.onnx: NVIDIA NeMo TitaNet-small (CC-BY-4.0). Turns a stretch of
  someone's voice into a "voiceprint", a list of 192 numbers; two stretches of
  the same voice give similar numbers. Chosen over WeSpeaker ResNet34 and the
  3D-Speaker models because it was the only one that cleanly separated
  different voices on recordings with known speakers (see diarization.py).

They're saved to models/diarization/ (or DIARIZATION_MODEL_DIR). The repository
keeps a copy there so the deployed API has them.
"""

import shutil
import sys
import tarfile
import tempfile
from pathlib import Path

import httpx

from app.core.config import get_settings

RELEASES = "https://github.com/k2-fsa/sherpa-onnx/releases/download"
SEGMENTATION_URL = f"{RELEASES}/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2"
EMBEDDING_URL = f"{RELEASES}/speaker-recongition-models/nemo_en_titanet_small.onnx"


def download(url: str, to: Path) -> None:
    print(f"Downloading {url.rsplit('/', 1)[-1]} ...")
    with httpx.stream("GET", url, follow_redirects=True, timeout=120) as response:
        response.raise_for_status()
        with open(to, "wb") as file:
            for block in response.iter_bytes():
                file.write(block)


def main() -> int:
    out = Path(get_settings().diarization_model_dir)
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / "segmentation.tar.bz2"
        download(SEGMENTATION_URL, archive)
        with tarfile.open(archive) as tar:
            member = next(m for m in tar.getmembers() if m.name.endswith("/model.onnx"))
            source = tar.extractfile(member)
            with open(out / "segmentation.onnx", "wb") as file:
                shutil.copyfileobj(source, file)
        download(EMBEDDING_URL, out / "embedding.onnx")
    print(f"Saved to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
