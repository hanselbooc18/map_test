import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import { palette } from './mobile-ui';
import type { RemoteLocation } from '@/lib/api';

export type HistoryGap = {
  previous: RemoteLocation;
  current: RemoteLocation;
  seconds: number;
  status: 'Normal' | 'Delayed' | 'Critical';
};

const mapHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" onerror="this.onerror=null;this.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'"><style>
html,body,#map{height:100%;width:100%;margin:0;background:#edf2ef}#map{touch-action:none}
.popup-record{display:block;width:100%;padding:8px 3px;border:0;border-top:1px solid #e3eae6;background:white;text-align:left;color:#14231f}
.leaflet-popup-content{max-height:55vh;overflow:auto}.leaflet-popup-content-wrapper{border-radius:10px}
</style><script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js" onerror="this.onerror=null;this.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'"></script></head><body><div id="map"></div><script>
if(!window.L){window.ReactNativeWebView.postMessage('MAP_LIBRARY_ERROR')}else{
const map=L.map('map',{preferCanvas:true,zoomAnimation:true,fadeAnimation:true,markerZoomAnimation:true,scrollWheelZoom:true,touchZoom:true,dragging:true,wheelDebounceTime:25,wheelPxPerZoomLevel:100,easeLinearity:0.25});
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
let loadedTiles=0,failedTiles=0,diagnosedTile=false;tiles.on('tileload',()=>{loadedTiles++;if(loadedTiles===1)send('map_ready')});tiles.on('tileerror',event=>{failedTiles++;const url=event.tile&&event.tile.src;send('tile_error',{url:url,coords:event.coords,online:navigator.onLine});if(!diagnosedTile&&url){diagnosedTile=true;fetch(url).then(response=>send('tile_http',{url:url,status:response.status,ok:response.ok,type:response.type})).catch(error=>send('tile_network_error',{url:url,error:String(error),online:navigator.onLine}))}});setTimeout(()=>{if(loadedTiles===0&&failedTiles>0)send('map_resource_error',{online:navigator.onLine,failedTiles:failedTiles})},8000);
const canvas=L.canvas({padding:0.5});
const markersLayer=L.layerGroup().addTo(map);const routeLayer=L.layerGroup().addTo(map);const selectedLayer=L.layerGroup().addTo(map);
let currentRecords=[];let signature='';let selectedId=null;
let pendingRecords=[];let pendingGaps=[];
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const send=(type,id)=>window.ReactNativeWebView.postMessage(JSON.stringify({type:type,id:id}));
const safeBounds=()=>{if(currentRecords.length){map.fitBounds(L.latLngBounds(currentRecords.map(r=>[r.latitude,r.longitude])),{padding:[42,42],maxZoom:16,animate:true})}};
const renderSelected=()=>{selectedLayer.clearLayers();const index=currentRecords.findIndex(r=>String(r.id)===String(selectedId));if(index<0)return;const r=currentRecords[index],point=[r.latitude,r.longitude];
L.circleMarker(point,{renderer:canvas,radius:13,color:'#7a38b5',weight:3,fillColor:'#ffffff',fillOpacity:.25}).addTo(selectedLayer);
if(index>0)L.polyline([[currentRecords[index-1].latitude,currentRecords[index-1].longitude],point],{renderer:canvas,color:'#7a38b5',weight:7,opacity:.75}).addTo(selectedLayer);
if(index<currentRecords.length-1)L.polyline([point,[currentRecords[index+1].latitude,currentRecords[index+1].longitude]],{renderer:canvas,color:'#7a38b5',weight:7,opacity:.75}).addTo(selectedLayer);
};
window.selectHistoryPoint=function(id){selectedId=String(id);renderSelected()};
window.beginHistory=function(){pendingRecords=[];pendingGaps=[]};
window.appendHistoryRecords=function(batch){pendingRecords.push(...batch)};
window.appendHistoryGaps=function(batch){pendingGaps.push(...batch)};
window.finishHistory=function(){window.setHistory(pendingRecords,pendingGaps);pendingRecords=[];pendingGaps=[]};
window.setHistory=function(records,gaps){
const nextSignature=records.map(r=>[r.id,r.device_id,r.update_id,r.latitude,r.longitude,r.accuracy,r.altitude,r.speed,r.heading,r.gps_fix_at,r.recorded_at,r.uploaded_at,r.server_received_at,r.created_at,r.updated_at].join(',')).join('|')+'#'+gaps.map(g=>String(g.previous.id)+':'+String(g.current.id)+':'+g.status).join('|');
currentRecords=records;if(nextSignature===signature){renderSelected();return}
signature=nextSignature;markersLayer.clearLayers();routeLayer.clearLayers();selectedLayer.clearLayers();
if(!records.length){map.setView([0,0],2,{animate:false});return}
const pointGroups=new Map();records.forEach((record,index)=>{const key=record.latitude.toFixed(8)+','+record.longitude.toFixed(8);if(!pointGroups.has(key))pointGroups.set(key,[]);pointGroups.get(key).push({record:record,index:index})});
const points=records.map(r=>[r.latitude,r.longitude]);if(points.length>1)L.polyline(points,{renderer:canvas,color:'#287aaf',weight:4,opacity:.82}).addTo(routeLayer).on('click',event=>{let nearest=records[0],distance=Infinity;records.forEach(record=>{const next=map.distance(event.latlng,[record.latitude,record.longitude]);if(next<distance){distance=next;nearest=record}});window.selectHistoryPoint(nearest.id);send('record',nearest.id)});
gaps.filter(g=>g.status!=='Normal').forEach(g=>{const a=[g.previous.latitude,g.previous.longitude],b=[g.current.latitude,g.current.longitude],color=g.status==='Delayed'?'#d18a00':'#b53d3d';L.polyline([a,b],{renderer:canvas,color:color,weight:6,opacity:.9}).addTo(routeLayer).bindPopup(g.status+' GPS gap · '+g.seconds.toFixed(1)+' sec',{autoPan:true,autoPanPadding:[38,38]}).on('click',()=>{window.selectHistoryPoint(g.current.id);send('gap',g.current.id)});});
pointGroups.forEach((group)=>{const first=group[0],r=first.record,isStart=group.some(item=>item.index===0),isEnd=group.some(item=>item.index===records.length-1);const color=isStart?'#147d64':isEnd?'#b53d3d':'#2864a5';const markerTitle=isStart?'First recorded location':isEnd?'Latest recorded location':'GPS location';
const marker=L.circleMarker([r.latitude,r.longitude],{renderer:canvas,radius:group.length>1?9:7,color:isStart&&isEnd?'#b53d3d':'#ffffff',weight:2,fillColor:color,fillOpacity:1,title:group.length>1?group.length+' GPS fixes at this location':markerTitle});
const popup=group.map(item=>{const x=item.record;const title=item.index===0?'First recorded location':item.index===records.length-1?'Latest recorded location':'GPS location';
if(group.length>1)return '<button class="popup-record" data-record-id="'+esc(x.id)+'"><b>Record '+esc(x.id)+' · '+esc(x.gps_fix_at||x.recorded_at)+'</b><br>Coordinates: '+x.latitude+', '+x.longitude+'<br>Accuracy: '+esc(x.accuracy)+' · Speed: '+esc(x.speed)+' · Heading: '+esc(x.heading)+'<br>Uploaded: '+esc(x.uploaded_at)+' · Received: '+esc(x.server_received_at)+'<br>DB created: '+esc(x.created_at)+' · Updated: '+esc(x.updated_at)+'</button>';
return '<b>'+title+'</b><br>Record: '+esc(x.id)+'<br>Device: '+esc(x.device_id)+'<br>Update: '+esc(x.update_id)+'<br>GPS fix: '+esc(x.gps_fix_at||x.recorded_at)+'<br>Coordinates: '+x.latitude+', '+x.longitude+'<br>Accuracy: '+esc(x.accuracy)+'<br>Speed: '+esc(x.speed)+'<br>Heading: '+esc(x.heading)+'<br>Uploaded: '+esc(x.uploaded_at)+'<br>Server received: '+esc(x.server_received_at)+'<br>DB created: '+esc(x.created_at)+'<br>DB updated: '+esc(x.updated_at)
}).join('');marker.bindPopup(popup,{autoPan:true,autoPanPadding:[38,38],maxWidth:300}).addTo(markersLayer).on('click',()=>{if(group.length===1){window.selectHistoryPoint(r.id);send('record',r.id)}});
});
safeBounds();renderSelected();
};
map.getContainer().addEventListener('click',event=>{const button=event.target.closest('[data-record-id]');if(button){const id=button.getAttribute('data-record-id');window.selectHistoryPoint(id);send('record',id)}});
window.ReactNativeWebView.postMessage('MAP_READY');}
</script></body></html>`;

type WebViewComponent = typeof import('react-native-webview').default;
function loadWebViewComponent(): WebViewComponent | null {
  try {
    return (require('react-native-webview') as typeof import('react-native-webview')).default;
  } catch (error) {
    if (error instanceof Error && error.message.includes('RNCWebViewModule')) return null;
    throw error;
  }
}

function CoordinateFallback({ records, gaps, height, onSelect }: {
  records: RemoteLocation[];
  gaps: HistoryGap[];
  height: number;
  onSelect: (id: string) => void;
}) {
  const [size, setSize] = useState({ width: 0, height });
  const layout = useMemo(() => {
    if (!records.length || size.width <= 0) return { points: [] as Array<{ record: RemoteLocation; x: number; y: number; index: number }>, lines: [] as Array<{ key: string; x: number; y: number; length: number; angle: number; color: string }> };
    const meanLatitude = records.reduce((sum, record) => sum + record.latitude, 0) / records.length;
    const cosine = Math.max(0.15, Math.cos(meanLatitude * Math.PI / 180));
    const values = records.map((record) => ({ record, x: record.longitude * cosine, y: record.latitude }));
    const bounds = values.reduce((result, point) => ({
      minX: Math.min(result.minX, point.x), maxX: Math.max(result.maxX, point.x),
      minY: Math.min(result.minY, point.y), maxY: Math.max(result.maxY, point.y),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const { minX, maxX, minY, maxY } = bounds;
    const spanX = Math.max(maxX - minX, 0.00001);
    const spanY = Math.max(maxY - minY, 0.00001);
    const padding = 24;
    const scale = Math.min((size.width - padding * 2) / spanX, (height - padding * 2) / spanY);
    const drawnWidth = spanX * scale, drawnHeight = spanY * scale;
    const left = (size.width - drawnWidth) / 2, top = (height - drawnHeight) / 2;
    const points = values.map((point, index) => ({
      record: point.record,
      index,
      x: left + (point.x - minX) * scale,
      y: top + (maxY - point.y) * scale,
    }));
    const gapByCurrentId = new Map(gaps.map((gap) => [gap.current.id, gap]));
    const lines = points.slice(1).map((point, offset) => {
      const previous = points[offset];
      const dx = point.x - previous.x, dy = point.y - previous.y;
      const gap = gapByCurrentId.get(point.record.id);
      return {
        key: String(point.record.id),
        x: (point.x + previous.x) / 2 - Math.sqrt(dx * dx + dy * dy) / 2,
        y: (point.y + previous.y) / 2 - 1,
        length: Math.sqrt(dx * dx + dy * dy),
        angle: Math.atan2(dy, dx) * 180 / Math.PI,
        color: gap?.status === 'Critical' ? palette.red : gap?.status === 'Delayed' ? palette.amber : '#287aaf',
      };
    });
    return { points, lines };
  }, [records, gaps, size.width, height]);

  const groupedPoints = useMemo(() => {
    const groups = new Map<string, typeof layout.points>();
    layout.points.forEach((point) => {
      const key = `${point.record.latitude.toFixed(7)},${point.record.longitude.toFixed(7)}`;
      const group = groups.get(key);
      if (group) group.push(point); else groups.set(key, [point]);
    });
    return [...groups.values()];
  }, [layout.points]);

  return <View style={[styles.fallback, { height }]} onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height })}>
    <View style={styles.fallbackHeader}><Text style={styles.fallbackTitle}>Coordinate view</Text><Text style={styles.fallbackHint}>Map tiles unavailable · {records.length} GPS fixes</Text></View>
    {layout.lines.map((line) => <View key={line.key} pointerEvents="none" style={[styles.routeSegment, { left: line.x, top: line.y, width: line.length, backgroundColor: line.color, transform: [{ rotate: `${line.angle}deg` }] }]} />)}
    {groupedPoints.map((group) => {
      const first = group.some((point) => point.index === 0);
      const latest = group.some((point) => point.index === records.length - 1);
      const point = latest ? group[group.length - 1] : group[0];
      const color = latest ? palette.red : first ? palette.green : '#2864a5';
      return <Pressable key={`${point.record.latitude}:${point.record.longitude}`} accessibilityRole="button" accessibilityLabel={`${group.length} GPS record(s) at ${point.record.latitude}, ${point.record.longitude}`} onPress={() => onSelect(String(point.record.id))} style={[styles.fallbackMarker, { left: point.x - 9, top: point.y - 9, borderColor: color }]}>
        <View style={[styles.fallbackDot, { backgroundColor: color }]} />
        {group.length > 1 ? <Text style={styles.markerCount}>{group.length}</Text> : null}
      </Pressable>;
    })}
    <View pointerEvents="none" style={styles.fallbackLegend}><Text style={styles.legendText}><Text style={{ color: palette.green }}>●</Text> First  <Text style={{ color: palette.red }}>●</Text> Latest  <Text style={{ color: palette.amber }}>━</Text> Long gap</Text></View>
  </View>;
}

export function HistoryMap({ records, gaps, selectedId, onSelect }: {
  records: RemoteLocation[];
  gaps: HistoryGap[];
  selectedId: number | null;
  onSelect: (id: string) => void;
}) {
  const NativeWebView = loadWebViewComponent();
  const webView = useRef<WebView | null>(null);
  const recordsRef = useRef(records);
  const gapsRef = useRef(gaps);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const { width } = useWindowDimensions();
  const mapHeight = Math.max(300, Math.min(430, width * 0.92));
  const selectedRecordId = selectedId == null ? '' : String(selectedId);
  const recordsKey = useMemo(() => records.map((record) => `${record.id}:${record.latitude}:${record.longitude}:${record.gps_fix_at}:${record.recorded_at}:${record.uploaded_at}:${record.server_received_at}:${record.created_at}`).join('|'), [records]);
  const gapsKey = useMemo(() => gaps.map((gap) => `${gap.current.id}:${gap.status}`).join('|'), [gaps]);

  useEffect(() => {
    recordsRef.current = records;
    gapsRef.current = gaps;
  }, [records, gaps]);

  useEffect(() => {
    if (!ready) return;
    const target = webView.current;
    if (!target) return;
    const inject = (script: string) => target.injectJavaScript(`try{${script}}catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({type:'render_error',message:String(error)}));} true;`);
    const batchSize = 40;
    inject('window.beginHistory();');
    for (let index = 0; index < recordsRef.current.length; index += batchSize) {
      inject(`window.appendHistoryRecords(${JSON.stringify(recordsRef.current.slice(index, index + batchSize))});`);
    }
    for (let index = 0; index < gapsRef.current.length; index += batchSize) {
      inject(`window.appendHistoryGaps(${JSON.stringify(gapsRef.current.slice(index, index + batchSize))});`);
    }
    inject('window.finishHistory();');
  }, [ready, recordsKey, gapsKey]);

  useEffect(() => {
    if (!ready || !selectedRecordId) return;
    webView.current?.injectJavaScript(`window.selectHistoryPoint(${JSON.stringify(selectedRecordId)}); true;`);
  }, [ready, selectedRecordId]);

  const handleMessage = (event: WebViewMessageEvent) => {
    const data = event.nativeEvent.data;
    if (data === 'MAP_READY') { setReady(true); return; }
    if (data === 'MAP_LIBRARY_ERROR') { if (__DEV__) console.warn('[HistoryMap] Leaflet library unavailable'); setMapError(true); return; }
    try {
      const message = JSON.parse(data) as { id?: number; type?: string; details?: { online?: boolean; failedTiles?: number; url?: string; coords?: unknown; status?: number; ok?: boolean; type?: string; error?: string } };
      if (message.type === 'map_ready') { setMapError(false); return; }
      if (message.type === 'tile_error') {
        if (__DEV__) console.warn('[HistoryMap] OSM tile request failed', message.details);
        return;
      }
      if (message.type === 'tile_http') {
        if (__DEV__) console.warn('[HistoryMap] OSM tile HTTP response', message.details);
        return;
      }
      if (message.type === 'tile_network_error') {
        if (__DEV__) console.warn('[HistoryMap] OSM tile diagnostic request failed', message.details);
        return;
      }
      if (message.type === 'map_resource_error') {
        if (__DEV__) console.warn('[HistoryMap] No map tiles loaded', message.details);
        setMapError(true); return;
      }
      if (message.type === 'render_error') {
        if (__DEV__) console.warn('[HistoryMap] render failure', event.nativeEvent.data);
        setMapError(true); return;
      }
      if (message.id != null) onSelect(String(message.id));
    } catch { /* Ignore unrelated map messages. */ }
  };

  if (!NativeWebView || mapError) return <CoordinateFallback records={records} gaps={gaps} height={mapHeight} onSelect={onSelect} />;

  return createElement(NativeWebView, {
    ref: webView,
    applicationNameForUserAgent: 'DevicePulse/1.0',
    source: { html: mapHtml },
    originWhitelist: ['*'],
    javaScriptEnabled: true,
    domStorageEnabled: true,
    nestedScrollEnabled: true,
    setSupportMultipleWindows: false,
    onMessage: handleMessage,
    onError: (event) => {
      const { code, description, url } = event.nativeEvent;
      if (__DEV__) console.warn('[HistoryMap] WebView load failure', { code, description, url });
      setMapError(true);
    },
    onHttpError: (event) => {
      const { statusCode, description, url } = event.nativeEvent;
      if (__DEV__) console.warn('[HistoryMap] HTTP error', { statusCode, description, url });
      if (url.includes('tile.openstreetmap.org')) {
        setMapError(true);
      }
    },
    style: [styles.map, { height: mapHeight }],
    accessibilityLabel: 'Interactive GPS history map with route and update-gap controls',
  });
}

const styles = StyleSheet.create({
  map: { width: '100%', backgroundColor: '#edf2ef' },
  fallback: { width: '100%', overflow: 'hidden', backgroundColor: '#edf2ef', justifyContent: 'center' },
  fallbackHeader: { position: 'absolute', zIndex: 4, top: 10, left: 12, right: 12, alignItems: 'center' },
  fallbackTitle: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  fallbackHint: { color: palette.muted, fontSize: 10 },
  routeSegment: { position: 'absolute', height: 3, opacity: 0.9, borderRadius: 2 },
  fallbackMarker: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 2, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  fallbackDot: { width: 8, height: 8, borderRadius: 4 },
  markerCount: { position: 'absolute', left: 10, top: -6, color: palette.ink, backgroundColor: palette.white, fontSize: 9, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 2 },
  fallbackLegend: { position: 'absolute', bottom: 8, alignSelf: 'center', backgroundColor: '#ffffffdd', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, zIndex: 4 },
  legendText: { color: palette.muted, fontSize: 10, fontWeight: '600' },
});
