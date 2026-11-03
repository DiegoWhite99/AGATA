#!/usr/bin/env bash
# Instala AGATA en una máquina nueva: entorno de Python, librerías y frontend.
# Uso: ./instalar.sh   (luego arranca con: .venv/bin/python app.py)
set -euo pipefail
cd "$(dirname "$0")"

echo "✦ Entorno de Python (.venv) y librerías de requirements.txt"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

if command -v npm >/dev/null 2>&1; then
  echo "✦ Frontend: TypeScript y compilación a static/js/"
  npm install
  npm run build
else
  echo "✦ npm no está instalado: se usa el JavaScript ya compilado en static/js/."
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "✦ Se creó .env desde .env.example: escribe ahí tu GROQ_API_KEY para activar la IA (opcional)."
fi

echo "✦ Listo. Arranca con: .venv/bin/python app.py   →   http://localhost:5000"
