import ast
import re
from pathlib import Path
from typing import List

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

BASE_DIR = Path(__file__).parent

artifact = joblib.load(BASE_DIR / "disease_model.joblib")
model = artifact["model"]
mlb = artifact["mlb"]
VALID_SYMPTOMS = set(mlb.classes_)


def normalize_symptom(value: str) -> str:
    """Same normalisation used in the notebook (spaces/underscores -> single _)."""
    return re.sub(r"[\s_]+", "_", str(value).strip().lower()).strip("_")


def norm_disease(name: str) -> str:
    """Case/whitespace-insensitive key so 'hepatitis A' matches 'Hepatitis A'."""
    return re.sub(r"\s+", " ", str(name).strip().lower())


# Precautions: {disease: [p1, p2, ...]}
_prec_df = pd.read_csv(BASE_DIR / "precautions_df.csv").drop(columns=["Unnamed: 0"], errors="ignore").fillna("")
PRECAUTIONS = {
    norm_disease(row["Disease"]): [p.strip() for p in row.iloc[1:] if str(p).strip()]
    for _, row in _prec_df.iterrows()
}

# Descriptions: {disease: text}
_desc_df = pd.read_csv(BASE_DIR / "description.csv")
DESCRIPTIONS = {norm_disease(d): t for d, t in zip(_desc_df["Disease"], _desc_df["Description"])}

# Medications: {disease: [..]}  (stored as stringified lists in the CSV)
_med_df = pd.read_csv(BASE_DIR / "medications.csv")
MEDICATIONS = {
    norm_disease(d): ast.literal_eval(m) for d, m in zip(_med_df["Disease"], _med_df["Medication"])
}

app = FastAPI(title="Disease Classification API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SymptomInput(BaseModel):
    symptoms: List[str] = Field(..., min_length=1, max_length=20, examples=[["itching", "skin_rash"]])
    top_k: int = Field(3, ge=1, le=5)

    @field_validator("symptoms")
    @classmethod
    def clean_and_check(cls, v: List[str]) -> List[str]:
        cleaned = sorted({normalize_symptom(s) for s in v} - {""})
        if not cleaned:
            raise ValueError("Provide at least one symptom.")
        unknown = [s for s in cleaned if s not in VALID_SYMPTOMS]
        if unknown:
            raise ValueError(f"Unknown symptom(s): {unknown}. Use GET /symptoms for valid values.")
        return cleaned


class DiseasePrediction(BaseModel):
    disease: str
    probability: float
    description: str
    precautions: List[str]
    medications: List[str]


class PredictionResponse(BaseModel):
    symptoms_used: List[str]
    predictions: List[DiseasePrediction]
    disclaimer: str


DISCLAIMER = (
    "This is an educational model, not a medical diagnosis. "
    "Please consult a qualified doctor before taking any medication."
)


@app.get("/")
def greet():
    return {"message": "Disease Classification API is running", "docs": "/docs"}


@app.get("/symptoms")
def list_symptoms():
    """All symptoms the model understands (use to build a dropdown / autocomplete)."""
    return {"count": len(mlb.classes_), "symptoms": list(mlb.classes_)}


@app.post("/predict", response_model=PredictionResponse)
def predict(data: SymptomInput):
    try:
        x = mlb.transform([data.symptoms])
        probs = model.predict_proba(x)[0]
    except Exception as exc:  # keep the API from leaking stack traces
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")

    top_idx = probs.argsort()[::-1][: data.top_k]

    results = []
    for i in top_idx:
        disease = str(model.classes_[i])
        key = norm_disease(disease)
        results.append(
            DiseasePrediction(
                disease=disease,
                probability=round(float(probs[i]), 4),
                description=DESCRIPTIONS.get(key, "No description available for this disease."),
                precautions=PRECAUTIONS.get(key, []),
                medications=MEDICATIONS.get(key, []),
            )
        )

    return PredictionResponse(symptoms_used=data.symptoms, predictions=results, disclaimer=DISCLAIMER)