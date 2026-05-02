# 📊 Frontend (Dashboard Electoral)

Aplicación construida en Next.js con React, diseñada para proporcionar visualizaciones en tiempo real del escrutinio electoral, imitando la estética de un centro de cómputo gubernamental oficial.

## 🚀 Cómo ejecutar
```bash
cd frontend
npm install
npm run dev
```
Luego visita **http://localhost:3000/dashboard**

## 🌟 Características Principales
1. **Mapa de Calor de Bolivia**: Renderiza dinámicamente un mapa geográfico utilizando `react-simple-maps` y TopoJSON. Se actualiza en vivo cambiando los colores departamentales según el volumen de participación electoral.
2. **Filtros Interactivos**: Al hacer clic en un departamento en el mapa, o seleccionarlo en el menú superior, toda la tabla de métricas se recalcula automáticamente.
3. **Métricas en Tiempo Real**: Auto-refresh cada 5 segundos mediante polling hacia las APIs de `rrv` y `oficial`.
4. **Ranking de Eficiencia**: Consumo del endpoint de `/tiempos` para mostrar qué mesas han procesado la información más rápido.
5. **Diseño Premium**: Interfaz construida con Glassmorphism, diseño responsivo y gráficos interactivos con `recharts`.
