import os
import tempfile
import numpy as np
import librosa
import torch
import torch.nn as nn
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ToneCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 32, 3, padding=1), nn.BatchNorm2d(32),  nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1), nn.BatchNorm2d(64),  nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(64, 128, 3, padding=1), nn.BatchNorm2d(128), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(128, 256, 3, padding=1), nn.BatchNorm2d(256), nn.ReLU(), nn.AdaptiveAvgPool2d(1),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(256, 128), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(128, 4),
        )

    def forward(self, x):
        return self.classifier(self.features(x))


MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'model.pt')
model = ToneCNN()
model.load_state_dict(torch.load(MODEL_PATH, map_location='cpu'))
model.eval()


def to_melspectrogram(path):
    y, _ = librosa.load(path, sr=22050, mono=True)
    mel = librosa.feature.melspectrogram(y=y, sr=22050, n_mels=128)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    if mel_db.shape[1] < 64:
        mel_db = np.pad(mel_db, ((0, 0), (0, 64 - mel_db.shape[1])))
    else:
        mel_db = mel_db[:, :64]
    mel_db = (mel_db - mel_db.mean()) / (mel_db.std() + 1e-8)
    return mel_db.astype(np.float32)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/predict")
async def predict(audio: UploadFile):
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name
    try:
        mel = to_melspectrogram(tmp_path)
        x = torch.tensor(mel).unsqueeze(0).unsqueeze(0)
        with torch.no_grad():
            probs = torch.softmax(model(x), dim=1).squeeze().tolist()
        return {'predicted_tone': int(np.argmax(probs)) + 1, 'probabilities': probs}
    except Exception as e:
        return {"error": str(e)}
    finally:
        os.unlink(tmp_path)
