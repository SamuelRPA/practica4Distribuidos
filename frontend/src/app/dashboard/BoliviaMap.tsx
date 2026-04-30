'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'leaflet-defaulticon-compatibility';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import { useEffect } from 'react';

// Bolivia coordinates
const BOLIVIA_CENTER: [number, number] = [-16.2902, -63.5887];
const BOLIVIA_ZOOM = 5;

// Accurate coordinates for Bolivia's Departments
const DEPT_COORDS: Record<string, [number, number]> = {
    "La Paz": [-15.5, -68.0],        // Shifted to show more of the department
    "Cochabamba": [-17.4, -65.5],    // Central Cochabamba
    "Santa Cruz": [-17.0, -61.5],    // Central Santa Cruz
    "Oruro": [-18.5, -67.5],         // Central Oruro
    "Potosí": [-20.5, -66.5],        // Central Potosí
    "Chuquisaca": [-20.0, -64.0],    // Central Chuquisaca
    "Tarija": [-21.5, -63.5],        // Central Tarija
    "Beni": [-14.0, -65.0],          // Central Beni
    "Pando": [-11.0, -67.0]          // Central Pando
};

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center[0], center[1], zoom, map]); // Destructure center so it only triggers on actual coordinate change
  return null;
}

export default function BoliviaMap({ 
    selectedDept, 
    selectedMuni, 
    recinto 
}: { 
    selectedDept: string, 
    selectedMuni: string,
    recinto: any 
}) {
    // Deterministic offset based on recinto ID so it doesn't jump on re-renders
    const getOffset = (idStr: string) => {
        let hash = 0;
        for (let i = 0; i < idStr.length; i++) {
            hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        // Generate pseudo-random offset roughly within 10-15km of the center
        const latOffset = ((Math.abs(hash) % 100) / 1000) - 0.05;
        const lngOffset = ((Math.abs(hash >> 4) % 100) / 1000) - 0.05;
        return [latOffset, lngOffset];
    };

    // Determine map center based on selection
    let center = BOLIVIA_CENTER;
    let zoom = BOLIVIA_ZOOM;
    let highlightRadius = 0;

    if (selectedDept && DEPT_COORDS[selectedDept]) {
        center = DEPT_COORDS[selectedDept];
        zoom = 7;
        highlightRadius = 100000; // 100km for dept
        
        if (selectedMuni) {
            zoom = 9;
            highlightRadius = 30000; // 30km for muni
        }
        if (recinto) {
            zoom = 15; // Closer zoom when recinto is selected
            highlightRadius = 0; // Turn off circle when we have an exact pin
            // Shift the center exactly to the deterministic offset
            const offset = getOffset(recinto.codRecinto);
            center = [center[0] + offset[0], center[1] + offset[1]];
        }
    }


    const markerPos: [number, number] = recinto && DEPT_COORDS[selectedDept] 
        ? [
            DEPT_COORDS[selectedDept][0] + getOffset(recinto.codRecinto)[0], 
            DEPT_COORDS[selectedDept][1] + getOffset(recinto.codRecinto)[1]
          ] 
        : center;

    // Custom Icon for Recinto
    const customIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    return (
        <div style={{ height: '400px', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
            <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%', zIndex: 1 }}>
                <ChangeView center={center} zoom={zoom} />
                
                <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="Modo Mapa (Voyager)">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Modo Satélite">
                        <TileLayer
                            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        />
                    </LayersControl.BaseLayer>
                </LayersControl>

                {highlightRadius > 0 && !recinto && (
                    <Circle 
                        center={center} 
                        radius={highlightRadius} 
                        pathOptions={{ color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.3, weight: 2 }} 
                    />
                )}
                
                {recinto && (
                    <Marker position={center} icon={customIcon}>
                        <Popup>
                            <div style={{ color: '#000' }}>
                                <strong>{recinto.nombre}</strong><br/>
                                <em>{recinto.direccion}</em><br/>
                                Mesas: {recinto.numMesas}
                            </div>
                        </Popup>
                    </Marker>
                )}
            </MapContainer>
        </div>
    );
}
