"""Reproduce the 320-input model; run in a separate Python export environment.

Dependencies used: Python 3.12, torch 2.7.1 CPU, ultralytics 8.4.38,
onnx 1.23.2, onnxslim 0.1.99. Browser users do not need Python.
"""
import argparse
import hashlib
import shutil
from pathlib import Path
from ultralytics import YOLO

parser = argparse.ArgumentParser()
parser.add_argument("weights", type=Path, help="Official yolo26n.pt weights")
parser.add_argument("--output", type=Path, default=Path("public/models/yolo26n-320.onnx"))
args = parser.parse_args()
expected = "9b09cc8bf347f0fc8a5f7657480587f25db09b34bf33b0652110fb03a8ad4fef"
if hashlib.sha256(args.weights.read_bytes()).hexdigest() != expected:
    raise SystemExit("The source weights do not match the verified official checkpoint")
exported = YOLO(str(args.weights)).export(
    format="onnx", imgsz=320, opset=17, simplify=True, nms=False, device="cpu"
)
args.output.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(exported, args.output)
print("Exported", args.output)
print("SHA256", hashlib.sha256(args.output.read_bytes()).hexdigest())
print("Export metadata includes a timestamp: review and update model-config.js when replacing the binary.")
