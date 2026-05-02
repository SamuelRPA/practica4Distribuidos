import React, { memo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";

const geoUrl = "https://raw.githubusercontent.com/techslides/D3-Maps/master/data/world/country/Bolivia.topo.json";

const BoliviaMap = ({ data, onDepartmentClick }: { data: any[], onDepartmentClick: (depto: string) => void }) => {
  // data format: [{ departamento: 'La Paz', porcentaje: 85, total_emitidos: 1000 }, ...]

  const colorScale = (porcentaje: number) => {
    if (porcentaje >= 80) return "#06d6a0"; // High participation - green
    if (porcentaje >= 50) return "#118ab2"; // Medium - blue
    if (porcentaje > 0) return "#ffd166"; // Low - yellow
    return "#eee"; // None
  };

  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={{
        scale: 2500,
        center: [-64.5, -16.5] // Centered on Bolivia
      }}
      width={400}
      height={400}
      style={{ width: "100%", height: "100%" }}
    >
      <ZoomableGroup zoom={1}>
        <Geographies geography={geoUrl}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const deptoName = geo.properties.name; // Based on TopoJSON properties for this file
              // Find matching data. The names in the DB might be uppercase or slightly different.
              const deptoData = data.find(d => 
                d.departamento.toLowerCase() === deptoName?.toLowerCase() ||
                d.departamento.toLowerCase().includes(deptoName?.toLowerCase()) ||
                (deptoName?.toLowerCase() || '').includes(d.departamento.toLowerCase())
              );
              
              const fill = deptoData ? colorScale(Number(deptoData.porcentaje)) : "#eee";

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                  style={{
                    default: { outline: "none", transition: "all 250ms" },
                    hover: { fill: "#ef476f", outline: "none", cursor: "pointer", strokeWidth: 2 },
                    pressed: { fill: "#e03e62", outline: "none" },
                  }}
                  onClick={() => {
                    const name = deptoData ? deptoData.departamento : deptoName;
                    onDepartmentClick(name);
                  }}
                />
              );
            })
          }
        </Geographies>
      </ZoomableGroup>
    </ComposableMap>
  );
};

export default memo(BoliviaMap);
