# Mandarin Tone Classifier

This is a project that I have wanted to do for a while. Since Mandarin is a tonal language, foreigners have trouble with pronouncing the right tones. (I'm no exception). So I finally trained my own model with the knowledge I learned from my cognitive internship 2(intro to deep learning) class.

The model classifies isolated Mandarin syllables into tones 1–4, with a web-based tone trainer demo.

**Model**: 4-layer CNN trained on mel spectrograms from the [Tone Perfect](https://tone.lib.msu.edu/) dataset (~10,000 samples). Achieves 100% test accuracy on clean audio, trained with SpecAugment + Gaussian noise augmentation for robustness.

## Demo

I made a quick demo using Claude Code so people can test out the model with their own audio. 


### Run locally

**Backend:**
```bash
cd demo/backend
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend:**
```bash
cd demo/frontend
npm install
npm run dev
```

Open http://localhost:5173.

## Results

![Training curves](docs/training_curves.png)

![Confusion matrix](docs/confusion_matrix.png)

## Training

The training notebook (`mandarin_tone_classifier.ipynb`) runs on Google Colab with a GPU runtime. It covers:

1. Data exploration (waveforms + mel spectrograms)
2. Feature extraction with librosa
3. Data augmentation (SpecAugment + Gaussian noise)
4. CNN training with PyTorch
5. Evaluation (classification report + confusion matrix)

## Project structure

```
mandarin-tone-classification/
  mandarin_tone_classifier.ipynb   # training notebook (Colab)
  model.pt                         # trained model weights
  demo/
    backend/
      main.py                      # FastAPI inference server
      requirements.txt
    frontend/
      src/App.jsx                  # React UI
```

## Dataset

[Tone Perfect](https://tone.lib.msu.edu/) by Michigan State University. ~10,000 studio-recorded MP3s of isolated Mandarin syllables, balanced across 4 tones.

## Future

- Classify tones in full sentences, not just isolated syllables
