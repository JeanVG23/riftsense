"""Exceptions d'ingestion, porteuses d'un code stable publié au visiteur."""
from __future__ import annotations


class IngestError(Exception):
    """Base. Le code vient du TYPE, jamais du texte du message."""
    code = "internal"


class RiotIdNotFound(IngestError):
    code = "riot_id_not_found"


class NoRankedGames(IngestError):
    code = "no_ranked_games"


class RiotUnavailable(IngestError):
    code = "riot_unavailable"


def error_code_of(exc: BaseException) -> str:
    """Code publiable pour une exception quelconque. Tout ce qui n'est pas une
    erreur d'ingestion connue est `internal` : on ne fuite pas un détail interne
    dans une réponse HTTP publique."""
    return exc.code if isinstance(exc, IngestError) else "internal"
