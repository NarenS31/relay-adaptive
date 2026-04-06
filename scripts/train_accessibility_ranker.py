#!/usr/bin/env python3
"""
Train a lightweight local accessibility priority ranker.

This uses a synthetic-but-curated seed dataset so the project has a complete
end-to-end ML pipeline without requiring an external CSV or third-party model.
"""

from __future__ import annotations

import json
import math
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "accessibility_priority"
DATASET_PATH = DATA_DIR / "seed_events.jsonl"
MODEL_PATH = ROOT / "assets" / "models" / "accessibility-priority-model.json"
REPORT_PATH = DATA_DIR / "evaluation_report.json"

LABELS = ["low", "medium", "high", "critical"]
LABEL_TO_INDEX = {label: idx for idx, label in enumerate(LABELS)}
SCORE_BY_LABEL = {
    "low": 3.0,
    "medium": 5.5,
    "high": 8.0,
    "critical": 9.8,
}

QUESTION_RE = re.compile(r"\?|\b(what|why|how|when|where|who|can you|could you|would you|are you)\b", re.I)
ACTION_RE = re.compile(r"\b(click|press|open|join|submit|answer|reply|send|start|stop|mute|unmute|turn on|turn off|review|check)\b", re.I)
URGENCY_RE = re.compile(r"\b(now|urgent|asap|immediately|hurry|quick|emergency|alert|warning|right away)\b", re.I)
ERROR_RE = re.compile(r"\b(error|failed|unable|warning|confirm|denied|expired|required)\b", re.I)


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", str(text or "").lower())).strip()


def tokenize(text: str) -> list[str]:
    return [token for token in normalize_text(text).split(" ") if token]


def derive_flags(example: dict) -> dict:
    text = str(example.get("text") or "")
    names = [str(name).lower() for name in example.get("user_names", [])]
    lowered = text.lower()
    return {
        "contains_question": bool(QUESTION_RE.search(text)),
        "contains_action": bool(ACTION_RE.search(text)),
        "contains_urgency": bool(URGENCY_RE.search(text)),
        "contains_error": bool(ERROR_RE.search(text)),
        "contains_name": any(name and name in lowered for name in names),
    }


def extract_features(example: dict) -> dict[str, float]:
    text = str(example.get("text") or "")
    tokens = tokenize(text)
    flags = derive_flags(example)

    features: dict[str, float] = {
        "bias": 1.0,
        f"type={example.get('event_type', 'generic')}": 1.0,
        f"mode={example.get('mode', 'deaf')}": 1.0,
    }

    app_name = normalize_text(example.get("app_name", ""))
    if app_name:
        features[f"app={app_name}"] = 1.0

    sound_category = str(example.get("sound_category") or "").strip().lower()
    if sound_category:
        features[f"sound={sound_category}"] = 1.0

    for key, enabled in flags.items():
        if enabled:
            features[f"flag={key}"] = 1.0

    length_bucket = "short" if len(tokens) < 6 else "medium" if len(tokens) < 14 else "long"
    features[f"length={length_bucket}"] = 1.0

    for token in tokens[:20]:
        features[f"tok={token}"] = features.get(f"tok={token}", 0.0) + 1.0

    for left, right in zip(tokens, tokens[1:]):
        bigram = f"{left}_{right}"
        features[f"bi={bigram}"] = features.get(f"bi={bigram}", 0.0) + 1.0

    return features


def softmax(logits: list[float]) -> list[float]:
    max_logit = max(logits)
    exps = [math.exp(value - max_logit) for value in logits]
    total = sum(exps) or 1.0
    return [value / total for value in exps]


def ensure_seed_dataset() -> list[dict]:
    if DATASET_PATH.exists():
        return [json.loads(line) for line in DATASET_PATH.read_text().splitlines() if line.strip()]

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    examples: list[dict] = []

    def add_many(event_type: str, label: str, texts: list[str], mode: str = "deaf", **extra):
        for text in texts:
            examples.append({
                "event_type": event_type,
                "mode": mode,
                "text": text,
                "label": label,
                "user_names": ["Alex", "Suhaan", "Relay"],
                **extra,
            })

    add_many("transcript", "critical", [
        "Fire alarm, everyone evacuate immediately.",
        "Alex, leave now. This is an emergency.",
        "Warning, the lab alarm is going off right now.",
        "Stop and evacuate now, the building alarm is active.",
        "Emergency alert. Exit the room immediately.",
    ])
    add_many("sound", "critical", [
        "fire alarm detected",
        "emergency siren nearby",
        "smoke detector alarm triggered",
        "security alarm sounding",
        "loud evacuation alarm",
    ], sound_category="emergency")
    add_many("screen", "critical", [
        "Payment failed. Confirm your card immediately.",
        "Security warning dialog requires confirmation now.",
        "Your session expired and submission failed.",
        "An error dialog blocked the screen and requires action.",
        "Critical warning: microphone permission denied.",
    ], mode="blind")

    add_many("transcript", "high", [
        "Alex, can you answer that question now?",
        "Please click the Join button.",
        "Can you submit the assignment before class ends?",
        "Relay, open Zoom and unmute yourself.",
        "You are presenting next, get ready now.",
        "Can you review the final slide before we start?",
        "Please answer the teacher right now.",
        "Join the meeting and reply when you are in.",
        "Alex, mute your microphone before speaking.",
        "Open the attachment and send it to the team.",
    ])
    add_many("sound", "high", [
        "door knock detected",
        "someone calling your name nearby",
        "phone ringing repeatedly",
        "timer alert sounding",
        "microwave timer finished",
    ], sound_category="attention")
    add_many("screen", "high", [
        "Submit button is now enabled.",
        "Error banner appeared at the top of the page.",
        "Join meeting dialog opened and is focused.",
        "Confirmation modal appeared with Accept and Cancel buttons.",
        "The download completed and requires confirmation.",
        "Password field is invalid and highlighted.",
        "A permission popup appeared in the center of the screen.",
        "Primary action button became available.",
    ], mode="blind")
    add_many("meeting", "high", [
        "Zoom meeting started",
        "Teams meeting is active",
        "Google Meet is now the frontmost app",
        "Manual meeting tracking started",
    ])

    add_many("transcript", "medium", [
        "We should probably review the agenda soon.",
        "I think the next section starts after lunch.",
        "The assignment is due tomorrow afternoon.",
        "There might be a new update in the portal.",
        "You may want to check the shared document later.",
        "The group can discuss the draft after class.",
        "We are switching topics now.",
        "The next slide has the project timeline.",
        "The class roster changed this morning.",
        "There is a note in the chat about tomorrow.",
    ])
    add_many("sound", "medium", [
        "appliance beep detected",
        "notification chime detected",
        "keyboard tapping nearby",
        "printer started running",
        "dishwasher beep heard",
    ], sound_category="appliance")
    add_many("screen", "medium", [
        "A new browser tab opened.",
        "Sidebar navigation expanded.",
        "A non-blocking notification appeared.",
        "The page scrolled to a new section.",
        "Secondary toolbar became visible.",
        "The active window changed to Chrome.",
    ], mode="blind")

    add_many("transcript", "low", [
        "Yeah, that was kind of funny.",
        "I was just talking about lunch earlier.",
        "The weather is nice today.",
        "We can chat about that later maybe.",
        "I like the background music in here.",
        "This is just casual conversation.",
        "Um, okay, I guess that makes sense.",
        "We were joking around before class.",
        "Someone is humming quietly.",
        "That song is still playing.",
    ])
    add_many("sound", "low", [
        "background music detected",
        "ambient television audio",
        "soft crowd noise",
        "chair movement in background",
        "low media playback detected",
    ], sound_category="media")
    add_many("screen", "low", [
        "Decorative image loaded on the page.",
        "Background animation changed slightly.",
        "Theme colors updated.",
        "A non-essential illustration became visible.",
        "An informational badge appeared in the footer.",
    ], mode="blind")

    # Template expansion for more training signal.
    names = ["Alex", "Suhaan", "Relay", "Jordan"]
    actions = ["click the Join button", "submit the form", "answer the question", "open the assignment", "mute the microphone"]
    urgencies = ["right now", "immediately", "before class ends", "as soon as possible"]
    for name in names:
        for action in actions:
            examples.append({
                "event_type": "transcript",
                "mode": "deaf",
                "text": f"{name}, please {action} {random.choice(urgencies)}.",
                "label": "high",
                "user_names": names,
            })
            examples.append({
                "event_type": "transcript",
                "mode": "deaf",
                "text": f"{name}, can you {action}?",
                "label": "high",
                "user_names": names,
            })

    casual_templates = [
        "We can talk about {topic} later.",
        "I was thinking about {topic} during lunch.",
        "The group mentioned {topic} earlier.",
    ]
    topics = ["music", "weekend plans", "the weather", "snacks", "sports"]
    for template in casual_templates:
        for topic in topics:
            examples.append({
                "event_type": "transcript",
                "mode": "deaf",
                "text": template.format(topic=topic),
                "label": "low",
                "user_names": names,
            })

    random.shuffle(examples)
    DATASET_PATH.write_text("\n".join(json.dumps(item) for item in examples) + "\n")
    return examples


def train(dataset: list[dict]) -> dict:
    weights = [dict() for _ in LABELS]
    learning_rate = 0.08
    regularization = 1e-5
    epochs = 45

    for _ in range(epochs):
        random.shuffle(dataset)
        for example in dataset:
            features = extract_features(example)
            gold_index = LABEL_TO_INDEX[example["label"]]

            logits = []
            for class_index in range(len(LABELS)):
                total = 0.0
                class_weights = weights[class_index]
                for feature_name, feature_value in features.items():
                    total += class_weights.get(feature_name, 0.0) * feature_value
                logits.append(total)

            probabilities = softmax(logits)
            for class_index in range(len(LABELS)):
                gradient = (1.0 if class_index == gold_index else 0.0) - probabilities[class_index]
                class_weights = weights[class_index]
                for feature_name, feature_value in features.items():
                    current = class_weights.get(feature_name, 0.0)
                    updated = current * (1.0 - regularization) + learning_rate * gradient * feature_value
                    if abs(updated) > 1e-9:
                        class_weights[feature_name] = updated
                    elif feature_name in class_weights:
                        del class_weights[feature_name]

    correct = 0
    for example in dataset:
        prediction = predict(weights, example)
        if prediction["label"] == example["label"]:
            correct += 1

    metrics = {
        "dataset_size": len(dataset),
        "train_accuracy": round(correct / max(1, len(dataset)), 4),
    }

    top_features = {}
    for class_index, label in enumerate(LABELS):
        ranked = sorted(weights[class_index].items(), key=lambda item: abs(item[1]), reverse=True)[:20]
        top_features[label] = ranked

    return {
        "labels": LABELS,
        "weights": weights,
        "metrics": metrics,
        "top_features": top_features,
    }


def split_dataset(dataset: list[dict], validation_ratio: float = 0.2) -> tuple[list[dict], list[dict]]:
    shuffled = list(dataset)
    random.shuffle(shuffled)
    validation_size = max(1, int(len(shuffled) * validation_ratio))
    validation = shuffled[:validation_size]
    train_set = shuffled[validation_size:]
    return train_set, validation


def evaluate(weights: list[dict], dataset: list[dict]) -> dict:
    confusion = {
        actual: {predicted: 0 for predicted in LABELS}
        for actual in LABELS
    }
    correct = 0

    per_label = {
        label: {
            "tp": 0,
            "fp": 0,
            "fn": 0,
            "support": 0,
        }
        for label in LABELS
    }

    samples = []

    for example in dataset:
        prediction = predict(weights, example)
        actual = example["label"]
        predicted = prediction["label"]
        confusion[actual][predicted] += 1
        per_label[actual]["support"] += 1

        if actual == predicted:
            correct += 1
            per_label[actual]["tp"] += 1
        else:
            per_label[predicted]["fp"] += 1
            per_label[actual]["fn"] += 1
            if len(samples) < 12:
                samples.append({
                    "text": example.get("text"),
                    "event_type": example.get("event_type"),
                    "actual": actual,
                    "predicted": predicted,
                    "confidence": prediction["confidence"],
                })

    label_metrics = {}
    macro_f1_sum = 0.0
    for label, stats in per_label.items():
        precision = stats["tp"] / max(1, stats["tp"] + stats["fp"])
        recall = stats["tp"] / max(1, stats["tp"] + stats["fn"])
        f1 = 0.0 if (precision + recall) == 0 else (2 * precision * recall) / (precision + recall)
        macro_f1_sum += f1
        label_metrics[label] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "support": stats["support"],
        }

    accuracy = correct / max(1, len(dataset))
    return {
        "size": len(dataset),
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1_sum / len(LABELS), 4),
        "per_label": label_metrics,
        "confusion_matrix": confusion,
        "misclassified_examples": samples,
    }


def predict(weights: list[dict], example: dict) -> dict:
    features = extract_features(example)
    logits = []
    for class_weights in weights:
        total = 0.0
        for feature_name, feature_value in features.items():
            total += class_weights.get(feature_name, 0.0) * feature_value
        logits.append(total)
    probabilities = softmax(logits)
    best_index = max(range(len(probabilities)), key=lambda idx: probabilities[idx])
    label = LABELS[best_index]
    return {
        "label": label,
        "confidence": round(probabilities[best_index], 4),
        "score": SCORE_BY_LABEL[label],
    }


def serialize(model: dict) -> dict:
    return {
        "type": "relay-accessibility-priority-ranker",
        "version": 1,
        "labels": model["labels"],
        "score_by_label": SCORE_BY_LABEL,
        "weights": model["weights"],
        "metrics": model["metrics"],
        "top_features": model["top_features"],
        "feature_spec": {
            "text_tokens": True,
            "text_bigrams": True,
            "event_type": True,
            "mode": True,
            "app_name": True,
            "sound_category": True,
            "heuristic_flags": [
                "contains_question",
                "contains_action",
                "contains_urgency",
                "contains_error",
                "contains_name",
            ],
        },
    }


def main() -> None:
    random.seed(7)
    dataset = ensure_seed_dataset()
    train_set, validation_set = split_dataset(dataset)
    model = train(train_set)
    train_eval = evaluate(model["weights"], train_set)
    validation_eval = evaluate(model["weights"], validation_set)
    model["metrics"].update({
        "train_size": len(train_set),
        "validation_size": len(validation_set),
        "train_accuracy": train_eval["accuracy"],
        "validation_accuracy": validation_eval["accuracy"],
        "validation_macro_f1": validation_eval["macro_f1"],
    })
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODEL_PATH.write_text(json.dumps(serialize(model), indent=2) + "\n")
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps({
        "dataset_path": str(DATASET_PATH.relative_to(ROOT)),
        "model_path": str(MODEL_PATH.relative_to(ROOT)),
        "train_evaluation": train_eval,
        "validation_evaluation": validation_eval,
    }, indent=2) + "\n")
    print(json.dumps({
        "dataset_path": str(DATASET_PATH.relative_to(ROOT)),
        "model_path": str(MODEL_PATH.relative_to(ROOT)),
        "dataset_size": model["metrics"]["dataset_size"],
        "train_accuracy": model["metrics"]["train_accuracy"],
        "validation_accuracy": model["metrics"]["validation_accuracy"],
        "validation_macro_f1": model["metrics"]["validation_macro_f1"],
        "report_path": str(REPORT_PATH.relative_to(ROOT)),
    }, indent=2))


if __name__ == "__main__":
    main()
