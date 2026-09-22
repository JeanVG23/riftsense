"""Sorties du service : R2 pour le raw, KV pour le silver et le gold.

Le raw est indexé PAR MATCH et non par joueur (spec section 4) : deux joueurs
inscrits ayant joué la même partie partagent le fichier, et build_dataset.py
ré-extrait les deux ADC depuis ce même raw.
"""
from __future__ import annotations

import boto3
from botocore.exceptions import ClientError

# Nom de fichier identique à celui de la couche locale (`riotlib._raw_path`, qui
# compose `{match_id}_{kind}` + `.json.zst`) : un rapatriement de R2 vers
# data/01_raw/ se fait alors par simple copie, sans passe de renommage. Seul le
# préfixe `raw/{platform}/` est propre à R2, où il sert de partitionnement.
_SUFFIX = {"match": "_match.json.zst", "timeline": "_timeline.json.zst"}


class R2Storage:
    """Écriture du raw dans R2 via l'API compatible S3."""

    def __init__(self, bucket: str, account_id: str, access_key: str, secret_key: str):
        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
        )

    @staticmethod
    def raw_key(platform: str, match_id: str, kind: str) -> str:
        """`raw/{platform}/{match_id}_match.json.zst` ou `_timeline.json.zst`."""
        return f"raw/{platform}/{match_id}{_SUFFIX[kind]}"

    def put_raw(self, platform: str, match_id: str, kind: str, blob: bytes) -> str:
        key = self.raw_key(platform, match_id, kind)
        self.client.put_object(Bucket=self.bucket, Key=key, Body=blob)
        return key

    def get_raw(self, platform: str, match_id: str, kind: str) -> bytes | None:
        """Lit un document raw, ou ``None`` lorsqu'il n'existe pas dans R2."""
        key = self.raw_key(platform, match_id, kind)
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
        except ClientError as error:
            code = str(error.response.get("Error", {}).get("Code", ""))
            if code in ("NoSuchKey", "404", "NotFound"):
                return None
            raise
        return response["Body"].read()
