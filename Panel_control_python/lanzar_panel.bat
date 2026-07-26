@echo off
REM Lanzador del Panel de Control PetTrack (reutiliza el venv del Proyecto 1).
set VENV_PY=%~dp0.venv\Scripts\python.exe
"%VENV_PY%" "%~dp0app.py"
