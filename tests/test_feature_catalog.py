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
        assert set(metadata) == {"label", "description", "unit", "theme"}, feature
        assert all(isinstance(value, str) and value.strip()
                   for value in metadata.values()), feature


# Vocabulaire fermé, tenu en miroir de THEME_ORDER dans
# web/cf/client/feature-catalog.ts. L'onglet ML rend une section par thème :
# un thème inconnu publierait une feature dans une section inexistante, un
# thème vidé rendrait une section morte. D'où l'égalité, pas l'inclusion.
THEMES = {"economy", "positioning", "vision", "fights", "objectives", "context"}


def test_themes_cover_exactly_the_closed_client_vocabulary():
    assert {metadata["theme"] for metadata in _catalog().values()} == THEMES
