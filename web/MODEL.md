# Model provenance

## Default: 320 × 320 export

- Source checkpoint: https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n.pt
- Checkpoint SHA256: `9b09cc8bf347f0fc8a5f7657480587f25db09b34bf33b0652110fb03a8ad4fef`
- Export: 2026-11-17, ultralytics 8.4.38, torch 2.7.1 CPU, ONNX opset 17, simplify=True, nms=False, imgsz=320.
- Artifact: `public/models/yolo26n-320.onnx`, 9,815,805 bytes.
- SHA256: `a2cdc8ceba1d7b71e9458a3e3cd1135457e52531f1256354c38964ead97e4243`
- Input `[1,3,320,320]`, output `[1,300,6]`, FP32, end-to-end detection.
- This is a re-export of the official weights, not a retrained or fine-tuned model. Lower resolution trades small-object recall for speed. Reproduction command: `python scripts/export-model.py /path/to/yolo26n.pt`.
- The binary is tracked in Git because export timestamps can change file hashes. Regeneration requires reviewing and updating `src/model-config.js`.

## Optional: official 640 × 640 export

- Model: Ultralytics YOLO26n (COCO 80 classes)
- Source: https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n.onnx
- Retrieved: 2026-11-17
- Size: 9,941,957 bytes
- SHA256: `2e947b787d9e787b93a16772a5f55b1d4d8c4d86f53146149c5d6a642442d6f7`
- Embedded exporter version: 8.4.38
- Embedded export date: 2026-04-17T18:49:03.540127
- ONNX opset: 20
- Input: float32 RGB, NCHW `[1,3,640,640]`, normalized to 0–1; aspect-preserving resize and padding 114.
- Output: `[1,300,6]`: `x1,y1,x2,y2,confidence,class_id`, coordinates in model-input pixels.
- End-to-end head: yes. No extra NMS.
- License: https://www.ultralytics.com/license (AGPL-3.0 / Enterprise)

The 640 binary is used without modification. Both the download script and browser worker verify SHA256. If upstream replaces the binary, review the new model and update the hashes deliberately.

Demo image: https://raw.githubusercontent.com/ultralytics/assets/main/im/bus.jpg

SHA256: `c02019c4979c191eb739ddd944445ef408dad5679acab6fd520ef9d434bfbc63`
