@echo off
REM Lanzador del Panel de Control PetTrack (reutiliza el venv del Proyecto 1).
set VENV_PY=D:\repositories\Embebidos_PetTrack\Panel_control_python\.venv\Scripts\python.exe
"%VENV_PY%" "%~dp0app.py"
