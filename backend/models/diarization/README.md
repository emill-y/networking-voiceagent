# Voice differentiation models

Used by `app/services/diarization.py` to tell voices apart in sessions. Both
run on the CPU through [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)
(Apache-2.0) and are free to use. Kept in the repository so the deployed API
has them; `python -m scripts.download_diarization_models` fetches them again.

| File | Model | License |
| --- | --- | --- |
| `segmentation.onnx` | [pyannote segmentation 3.0](https://huggingface.co/pyannote/segmentation-3.0) (sherpa-onnx export) | MIT |
| `embedding.onnx` | [NVIDIA NeMo TitaNet-small](https://catalog.ngc.nvidia.com/orgs/nvidia/teams/nemo/models/titanet_small) (sherpa-onnx export `nemo_en_titanet_small.onnx`) | CC-BY-4.0 |

TitaNet-small was picked after comparing the voiceprint models sherpa-onnx
publishes on recordings with known speakers; it was the only one where every
pair of turns by the same person scored higher than every pair by different
people (see the thresholds in `diarization.py`).
