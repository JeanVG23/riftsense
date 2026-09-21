"""The public model manifest and its English presentation catalog cannot drift."""
import json
from pathlib import Path

import role_features as rf


CATALOG_PATH = Path(__file__).parents[1] / "shared" / "feature_catalog.json"


def _catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text())


def test_catalog_covers_exactly_the_public_role_features():
    public = set().union(*(rf.public_features(role) for role in rf.ROLES))
    # win_rate is the fixed-window scalar appended by ebm_feature_columns; it
    # is intentionally absent from the per-game role manifests.
    assert set(_catalog()) == public | {"win_rate"}


def test_every_feature_has_complete_english_presentation_metadata():
    for feature, metadata in _catalog().items():
        assert set(metadata) == {"label", "description", "unit"}, feature
        assert all(isinstance(value, str) and value.strip()
                   for value in metadata.values()), feature
