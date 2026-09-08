# Contexte de build = racine du dépôt : l'image embarque src/core/ (riotlib et ses
# voisins) que le service importe tel quel. C'est ce qui évite de réimplémenter la
# couche d'extraction et donc de créer une dérive avec le pipeline local.
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY src/core/ ./src/core/
COPY service/ ./service/
COPY data/00_static/ ./data/00_static/

# Convention flat-import du dépôt : les modules de src/core s'importent à plat.
ENV PYTHONPATH=/app/src/core:/app/service

# Le catalogue Data Dragon (data/00_static/ddragon/) n'est PAS versionne dans git
# (contrairement a champion_traits.json, force-ajoute) : la machine qui construit
# l'image peut ou non l'avoir en local. fetch_ddragon()/fetch_ddragon_items() sont
# idempotents (sautent le telechargement si le fichier existe deja, cf.
# champion_profiles.py) : la ligne ci-dessous couvre les deux cas, sans quoi
# derive_context/load_items renverraient un catalogue vide en silence sur une
# machine de build qui n'a jamais lance le pipeline localement.
RUN python3 -c "import sys; sys.path.insert(0, 'src/core'); import champion_profiles as cp; cp.fetch_ddragon(); cp.fetch_ddragon_items()"

# Cloud Run impose $PORT. Un worker, un thread : un seul consommateur de la clé Riot.
# Le timeout couvre un job de 20 parties (environ 60 s) avec de la marge.
CMD exec gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 1 --timeout 300 app:app
