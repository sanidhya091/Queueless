import React from 'react';

import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import type { CameraRef, ViewStateChangeEvent } from '@maplibre/maplibre-react-native';

import type { RootStackParamList } from '../App';
import { calculateQueueSummary } from '../lib/queue';
import type { QueueLevel, QueueReport } from '../lib/queue';
import {
  fetchCurrentQueueReports,
  groupReportsByPlace,
} from '../lib/queueData';
import {
  fetchMapPlaces,
  distanceKm,
  JABALPUR_REGION,
  regionForCoordinate,
} from '../lib/mapPlaces';
import type { LocatedPlace, MapRegion } from '../lib/mapPlaces';
import { useMapLocation } from '../lib/useMapLocation';

const COLORS = {
  background: '#0F172A',
  card: '#1E293B',
  cardLight: '#243552',
  lime: '#84CC16',
  green: '#22C55E',
  yellow: '#F59E0B',
  red: '#EF4444',
  orange: '#F97316',
  white: '#F8FAFC',
  muted: '#94A3B8',
  border: '#334155',
};

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

type MapPlace = LocatedPlace & {
  waitMinutes: number | null;
  queueLevel: QueueLevel | null;
  reportCount: number;
  confidence: 'Low' | 'Medium' | 'High';
  latestCurrentReport: QueueReport | null;
};

type MapStatus = 'loading' | 'ready' | 'denied' | 'blocked' | 'unavailable';

// OpenFreeMap's public instance is free, requires no registration or API key,
// permits commercial use, and supplies the OpenMapTiles/OSM attribution through
// MapLibre. It is an appropriate no-billing development source; review its
// terms and capacity before relying on it for production traffic.
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

function getQueueColor(level: QueueLevel | null) {
  if (level === 'Low') return COLORS.green;
  if (level === 'Moderate') return COLORS.yellow;
  if (level === 'High') return COLORS.red;
  return COLORS.muted;
}

function centerForRegion(region: MapRegion): [number, number] {
  return [region.longitude, region.latitude];
}

function zoomForRegion(region: MapRegion) {
  // A small correction accounts for the typical phone viewport being wider than
  // one 256px world tile. Region deltas remain the source of truth for queries.
  return Math.max(0, Math.min(22, Math.log2(360 / Math.max(region.longitudeDelta, 0.0001)) + 0.5));
}

function regionForViewState(viewState: ViewStateChangeEvent): MapRegion {
  const [west, south, east, north] = viewState.bounds;
  const [longitude, latitude] = viewState.center;
  const longitudeDelta = east >= west ? east - west : 360 - west + east;
  return {
    latitude,
    longitude,
    latitudeDelta: Math.max(0.0001, north - south),
    longitudeDelta: Math.max(0.0001, longitudeDelta),
  };
}

function getQueueMessage(level: QueueLevel | null) {
  if (level === 'Low') return 'Low queue';
  if (level === 'Moderate') return 'Moderate queue';
  if (level === 'High') return 'High queue';
  return 'No current data';
}

function formatWait(minutes: number | null) {
  if (minutes === null) return 'No data';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `~${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return remaining === 0
    ? `~${hours} hr`
    : `~${hours} hr ${remaining} min`;
}

function getAgeText(createdAt: string) {
  const minutes = Math.floor(
    Math.max(0, Date.now() - new Date(createdAt).getTime()) / 60000
  );
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? '1 hr ago' : `${hours} hrs ago`;
}

function getFreshnessColor(report: QueueReport | null) {
  if (!report) return COLORS.muted;
  const age = Math.max(0, Date.now() - new Date(report.created_at).getTime());
  if (age < 30 * 60 * 1000) return COLORS.green;
  if (age < 60 * 60 * 1000) return COLORS.yellow;
  return COLORS.orange;
}

function getIcon(category: string): keyof typeof Ionicons.glyphMap {
  const value = category.toLowerCase();
  if (value.includes('hospital')) return 'medkit-outline';
  if (value.includes('bank')) return 'business-outline';
  if (value.includes('rto') || value.includes('transport')) return 'car-outline';
  if (value.includes('passport')) return 'document-text-outline';
  if (value.includes('college') || value.includes('school')) return 'school-outline';
  if (value.includes('railway')) return 'train-outline';
  return 'business-outline';
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const QueueMarker = React.memo(function QueueMarker({
  place,
  selected,
  onSelect,
}: {
  place: MapPlace;
  selected: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <Marker
      id={String(place.id)}
      lngLat={[place.coordinate.longitude, place.coordinate.latitude]}
      anchor="center"
      selected={selected}
      accessibilityLabel={`${place.name}, ${getQueueMessage(place.queueLevel)}`}
      onPress={() => onSelect(place.id)}
    >
      <View style={styles.markerFrame} collapsable={false}>
        <View style={[
          styles.marker,
          { backgroundColor: getQueueColor(place.queueLevel) },
          selected && styles.selectedMarker,
        ]}>
          <Ionicons name={getIcon(place.category)} size={16} color={COLORS.background} />
        </View>
      </View>
    </Marker>
  );
});

const UserLocationMarker = React.memo(function UserLocationMarker({
  coordinate,
}: {
  coordinate: LocatedPlace['coordinate'];
}) {
  return (
    <Marker
      id="user-location"
      lngLat={[coordinate.longitude, coordinate.latitude]}
      anchor="center"
      accessibilityLabel="Your location"
    >
      <View style={styles.userLocationMarker} />
    </Marker>
  );
});

function getLocationTitle(status: MapStatus) {
  if (status === 'loading') return 'Finding your location';
  if (status === 'denied') return 'Location access is off';
  if (status === 'blocked') return 'Location access is blocked';
  if (status === 'unavailable') return 'Location is unavailable';
  return '';
}

function getLocationDescription(
  status: MapStatus,
  usingLastKnown: boolean,
  unavailableReason: 'services-disabled' | 'fetch-failed' | null,
) {
  if (status === 'loading' && usingLastKnown) return 'Using your last known position while updating.';
  if (status === 'loading') return 'We will use Jabalpur as the fallback if needed.';
  if (status === 'denied') return 'The map is using Jabalpur as a fallback.';
  if (status === 'blocked') return 'Enable location in device settings to find places near you.';
  if (status === 'unavailable' && unavailableReason === 'services-disabled') {
    return 'Turn on device location to find places near you. Jabalpur remains available.';
  }
  if (status === 'unavailable') return 'A current position was not available. Jabalpur remains available.';
  return '';
}

export default function MapScreen({ navigation }: Props) {
  const {
    status: locationStatus,
    coordinate: userLocation,
    permissionGranted,
    usingLastKnown,
    unavailableReason,
    locate,
  } = useMapLocation();
  const [locatedPlaces, setLocatedPlaces] = React.useState<LocatedPlace[]>([]);
  const [reports, setReports] = React.useState<QueueReport[]>([]);
  const [now, setNow] = React.useState(Date.now);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [mapMoved, setMapMoved] = React.useState(false);
  const [mapError, setMapError] = React.useState<string | null>(null);
  const [areaNotice, setAreaNotice] = React.useState<string | null>(null);
  const [queueUnavailable, setQueueUnavailable] = React.useState(false);
  const [mapSlow, setMapSlow] = React.useState(false);
  const [mapAttempt, setMapAttempt] = React.useState(0);
  const [previewHeight, setPreviewHeight] = React.useState(260);
  const [openingDirections, setOpeningDirections] = React.useState(false);

  const cameraRef = React.useRef<CameraRef>(null);
  const mapReadyRef = React.useRef(false);
  const mapLoadedRef = React.useRef(false);
  const mapRegionRef = React.useRef<MapRegion>(JABALPUR_REGION);
  const loadedRegionRef = React.useRef<MapRegion>(JABALPUR_REGION);
  const activeRequestRef = React.useRef<AbortController | null>(null);
  const requestIdRef = React.useRef(0);
  const centeredOnUserRef = React.useRef(false);
  const activeRef = React.useRef(false);
  const wantsRecenterRef = React.useRef(false);

  const places = React.useMemo(() => {
    const grouped = groupReportsByPlace(reports);
    return locatedPlaces.map((place): MapPlace => {
      const summary = calculateQueueSummary(grouped.get(place.id) || [], now);
      return { ...place, ...summary };
    });
  }, [locatedPlaces, reports, now]);
  const selectedPlace = places.find((place) => place.id === selectedId) || null;
  const selectPlace = React.useCallback((id: number) => setSelectedId(id), []);
  const canGeocode = Platform.OS === 'ios' || permissionGranted;

  const loadMapData = React.useCallback(
    async (region: MapRegion, canGeocode: boolean, isRefresh = false) => {
      activeRequestRef.current?.abort();
      const controller = new AbortController();
      activeRequestRef.current = controller;
      const requestId = ++requestIdRef.current;

      setRefreshing(isRefresh);
      setLoading(true);
      setMapError(null);
      const current = () => activeRef.current && !controller.signal.aborted;
      const timeout = setTimeout(() => controller.abort(), 90000);

      try {
        const mapResult = await fetchMapPlaces(
          region,
          canGeocode,
          controller.signal,
          (stored) => {
            if (current()) setLocatedPlaces(stored);
          }
        );
        if (!current()) return;
        setLocatedPlaces(mapResult.places);
        try {
          const currentReports = await fetchCurrentQueueReports(
            mapResult.places.map((place) => place.id),
            Date.now(),
            controller.signal
          );
          if (!current()) return;
          setReports(currentReports);
          setNow(Date.now());
          setQueueUnavailable(false);
        } catch (error) {
          if (!current()) throw error;
          setReports([]);
          setQueueUnavailable(true);
          setMapError('Queue updates are unavailable. Places are still shown.');
        }
        if (!current()) return;
        loadedRegionRef.current = region;
        setMapMoved(false);

        if (mapResult.limited) {
          setAreaNotice('Some places are outside the result limit. Zoom in to narrow your search.');
        } else if (mapResult.unresolved > 0) {
          setAreaNotice(`${mapResult.unresolved} place${mapResult.unresolved === 1 ? '' : 's'} need a verified map location.`);
        } else {
          setAreaNotice(null);
        }
      } catch (error) {
        if (activeRef.current && requestId === requestIdRef.current) {
          console.error('MAP DATA ERROR:', error);
          setMapError('Could not load places for this area.');
        }
      } finally {
        clearTimeout(timeout);
        if (activeRef.current && requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  useFocusEffect(
    React.useCallback(() => {
      activeRef.current = true;
      // Load the Jabalpur fallback immediately while the permission/location
      // lookup runs. If a location arrives, this callback runs again around it.
      if (userLocation && (!centeredOnUserRef.current || wantsRecenterRef.current)) {
        centeredOnUserRef.current = true;
        wantsRecenterRef.current = false;
        mapRegionRef.current = regionForCoordinate(userLocation);
        if (mapReadyRef.current) {
          cameraRef.current?.easeTo({
            center: centerForRegion(mapRegionRef.current),
            zoom: zoomForRegion(mapRegionRef.current),
            duration: 400,
          });
        }
      }
      void loadMapData(mapRegionRef.current, canGeocode, true);

      const timer = setInterval(() => setNow(Date.now()), 30000);
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'background') activeRequestRef.current?.abort();
        if (state === 'active') setNow(Date.now());
      });
      return () => {
        activeRef.current = false;
        requestIdRef.current += 1;
        activeRequestRef.current?.abort();
        clearInterval(timer);
        subscription.remove();
      };
    }, [canGeocode, loadMapData, userLocation])
  );

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (!mapLoadedRef.current) setMapSlow(true);
    }, 15000);
    return () => clearTimeout(timer);
  }, [mapAttempt]);

  const handleRegionChangeComplete = (
    event: NativeSyntheticEvent<ViewStateChangeEvent>
  ) => {
    const region = regionForViewState(event.nativeEvent);
    mapRegionRef.current = region;
    const loaded = loadedRegionRef.current;
    setMapMoved(
      Math.abs(region.latitude - loaded.latitude) > loaded.latitudeDelta * 0.2 ||
      Math.abs(region.longitude - loaded.longitude) > loaded.longitudeDelta * 0.2 ||
      Math.abs(region.latitudeDelta - loaded.latitudeDelta) > loaded.latitudeDelta * 0.3
    );
  };

  const searchThisArea = () => {
    setMapMoved(false);
    void loadMapData(mapRegionRef.current, canGeocode, true);
  };

  const centerOnUser = () => {
    setSelectedId(null);
    if (userLocation && !usingLastKnown) {
      const region = regionForCoordinate(userLocation);
      cameraRef.current?.easeTo({
        center: centerForRegion(region),
        zoom: zoomForRegion(region),
        duration: 600,
      });
      mapRegionRef.current = region;
      void loadMapData(region, canGeocode, true);
      return;
    }

    if (locationStatus === 'blocked' || unavailableReason === 'services-disabled') {
      Linking.openSettings().catch(() => {
        Alert.alert('Location settings unavailable', 'Enable location access from your device settings.');
      });
      return;
    }

    wantsRecenterRef.current = true;
    void locate(true);
  };

  const openDirections = async (place: MapPlace) => {
    if (openingDirections) return;
    setOpeningDirections(true);
    // Geocoded pins are approximate: let Google resolve the full place/address
    // for directions, rather than navigating blindly to the guessed pin.
    const destination = place.coordinateSource === 'stored'
      ? `${place.coordinate.latitude},${place.coordinate.longitude}`
      : [place.name, place.address, place.city].filter(Boolean).join(', ');
    const appUrl = Platform.OS === 'ios'
      ? `comgooglemaps://?daddr=${encodeURIComponent(destination)}&directionsmode=driving`
      : `google.navigation:q=${encodeURIComponent(destination)}`;
    const webUrl =
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

    try {
      await Linking.openURL(appUrl);
    } catch {
      try {
        await Linking.openURL(webUrl);
      } catch (error) {
        console.error('OPEN DIRECTIONS ERROR:', error);
        Alert.alert('Could not open directions', 'Google Maps could not be opened on this device.');
      }
    } finally {
      if (activeRef.current) setOpeningDirections(false);
    }
  };

  const locationAction = locationStatus === 'blocked'
    ? 'Settings'
    : locationStatus === 'unavailable' && unavailableReason === 'services-disabled'
    ? 'Settings'
    : locationStatus === 'denied'
    || locationStatus === 'unavailable'
    ? 'Try again'
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.refreshButton}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={21} color={COLORS.white} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Explore queues</Text>
          <Text style={styles.subtitle}>
            {places.length > 0 ? `${places.length} places in this area` : 'Know the queue before you go'}
          </Text>
        </View>

        <Pressable
          style={styles.refreshButton}
          accessibilityRole="button"
          accessibilityLabel="Refresh places and queue reports"
          accessibilityState={{ busy: loading, disabled: loading }}
          onPress={() => loadMapData(mapRegionRef.current, canGeocode, true)}
          disabled={loading}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={COLORS.lime} />
          ) : (
            <Ionicons name="refresh" size={19} color={COLORS.white} />
          )}
        </Pressable>
      </View>

      <View style={styles.mapContainer}>
        <Map
          key={mapAttempt}
          style={styles.map}
          mapStyle={MAP_STYLE_URL}
          contentInset={{ top: 12, right: 8, bottom: selectedPlace ? previewHeight + 16 : 30, left: 8 }}
          attribution
          compass={false}
          scaleBar={false}
          onDidFinishLoadingMap={() => {
            mapReadyRef.current = true;
            mapLoadedRef.current = true;
            setMapSlow(false);
            cameraRef.current?.easeTo({
              center: centerForRegion(mapRegionRef.current),
              zoom: zoomForRegion(mapRegionRef.current),
              duration: 300,
            });
          }}
          onDidFailLoadingMap={() => {
            mapReadyRef.current = false;
            mapLoadedRef.current = false;
            setMapSlow(true);
          }}
          onRegionDidChange={handleRegionChangeComplete}
          onPress={() => setSelectedId(null)}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: centerForRegion(JABALPUR_REGION),
              zoom: zoomForRegion(JABALPUR_REGION),
            }}
          />
          {permissionGranted && locationStatus === 'ready' && userLocation && (
            <UserLocationMarker coordinate={userLocation} />
          )}
          {places.map((place) => (
            <QueueMarker
              key={`${place.id}:${place.queueLevel}:${selectedId === place.id}`}
              place={place}
              selected={selectedId === place.id}
              onSelect={selectPlace}
            />
          ))}
        </Map>

        <View style={styles.topOverlays} pointerEvents="box-none">
          <View style={styles.legend}>
            <LegendItem color={COLORS.green} label="Low" />
            <LegendItem color={COLORS.yellow} label="Moderate" />
            <LegendItem color={COLORS.red} label="High" />
            <LegendItem color={COLORS.muted} label="No data" />
          </View>

          {locationStatus !== 'ready' && (
            <View style={styles.locationBanner}>
            <View style={styles.locationBannerIcon}>
              <Ionicons
                name={locationStatus === 'loading' ? 'locate-outline' : 'location-outline'}
                size={17}
                color={COLORS.lime}
              />
            </View>
            <View style={styles.locationBannerInfo}>
              <Text style={styles.locationBannerTitle}>{getLocationTitle(locationStatus)}</Text>
              <Text style={styles.locationBannerText}>
                {getLocationDescription(locationStatus, usingLastKnown, unavailableReason)}
              </Text>
            </View>
            {locationAction && (
              <Pressable
                style={styles.locationAction}
                accessibilityRole="button"
                onPress={centerOnUser}
              >
                <Text style={styles.locationActionText}>{locationAction}</Text>
              </Pressable>
            )}
            </View>
          )}
          {locationStatus === 'ready' && usingLastKnown && (
            <Text style={styles.areaNoticeText}>Using your last known location</Text>
          )}

        {mapMoved && !loading && (
          <Pressable style={styles.searchAreaButton} accessibilityRole="button" onPress={searchThisArea}>
            <Ionicons name="search" size={15} color={COLORS.background} />
            <Text style={styles.searchAreaText}>Search this area</Text>
          </Pressable>
        )}

        {mapError && !loading && (
          <View style={styles.dataNotice}>
            <Ionicons name="information-circle-outline" size={15} color={COLORS.yellow} />
            <Text style={styles.dataNoticeText}>{mapError}</Text>
            <Pressable accessibilityRole="button" onPress={searchThisArea} style={styles.locationAction}>
              <Text style={styles.locationActionText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {areaNotice && !loading && (
          <View style={styles.areaNotice}>
            <Text style={styles.areaNoticeText}>{areaNotice}</Text>
          </View>
        )}

        {loading && locationStatus !== 'loading' && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={COLORS.lime} />
            <Text style={styles.loadingText}>{places.length ? 'Updating places and queues…' : 'Finding places in this area…'}</Text>
          </View>
        )}
        </View>

        {mapSlow && (
          <View style={styles.emptyMap}>
            <Text style={styles.emptyTitle}>Map is taking longer to load</Text>
            <Text style={styles.emptySubtitle}>Check your internet connection, then retry.</Text>
            <Pressable style={styles.retryMapButton} accessibilityRole="button" onPress={() => {
              mapReadyRef.current = false;
              mapLoadedRef.current = false;
              setMapSlow(false);
              setMapAttempt((value) => value + 1);
            }}>
              <Text style={styles.locationActionText}>Reload map</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={[styles.locationButton, selectedPlace && { bottom: previewHeight + 28 }]}
          accessibilityRole="button"
          accessibilityLabel="Center on your location"
          disabled={locationStatus === 'loading'}
          onPress={centerOnUser}
        >
          <Ionicons
            name={userLocation ? 'locate' : 'locate-outline'}
            size={20}
            color={userLocation ? COLORS.lime : COLORS.white}
          />
        </Pressable>

        {!loading && !mapError && !mapSlow && places.length === 0 && (
          <View style={styles.emptyMap}>
            <Ionicons name="map-outline" size={28} color={COLORS.muted} />
            <Text style={styles.emptyTitle}>No mapped places in this area</Text>
            <Text style={styles.emptySubtitle}>
              {areaNotice
                ? 'Some places still need a usable address or verified coordinates.'
                : 'Move the map and search another area. New places appear as they are added.'}
            </Text>
          </View>
        )}

        {selectedPlace && (
          <View style={styles.placePreview} onLayout={(event) => setPreviewHeight(event.nativeEvent.layout.height)}>
            <ScrollView style={styles.previewScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.previewHeader}>
              <View
                style={[
                  styles.previewIcon,
                  { backgroundColor: `${getQueueColor(selectedPlace.queueLevel)}20` },
                ]}
              >
                <Ionicons
                  name={getIcon(selectedPlace.category)}
                  size={21}
                  color={getQueueColor(selectedPlace.queueLevel)}
                />
              </View>
              <View style={styles.previewInfo}>
                <Text style={styles.previewName} numberOfLines={2}>{selectedPlace.name}</Text>
                <Text style={styles.previewCategory} numberOfLines={1}>
                  {selectedPlace.category}
                  {userLocation ? ` · ~${distanceKm(userLocation, selectedPlace.coordinate).toFixed(1)} km away` : ''}
                </Text>
              </View>
              <Pressable
                style={styles.closePreviewButton}
                accessibilityRole="button"
                accessibilityLabel="Close place preview"
                onPress={() => setSelectedId(null)}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={COLORS.muted} />
              </Pressable>
            </View>

            <Text style={styles.previewAddress} numberOfLines={2}>
              {selectedPlace.address || selectedPlace.city}
            </Text>
            {selectedPlace.coordinateSource === 'geocoded' && (
              <Text style={styles.approximateText}>Approximate pin · check the address</Text>
            )}

            <View style={styles.previewQueueRow}>
              <View style={styles.previewQueueMain}>
                <Text style={[styles.previewWait, { color: getQueueColor(selectedPlace.queueLevel) }]}>
                  {queueUnavailable ? 'Unavailable' : formatWait(selectedPlace.waitMinutes)}
                </Text>
                <Text style={[styles.previewLevel, { color: getQueueColor(selectedPlace.queueLevel) }]}>
                  {queueUnavailable ? 'Queue updates unavailable' : getQueueMessage(selectedPlace.queueLevel)}
                </Text>
              </View>
              <View style={styles.previewMeta}>
                {selectedPlace.reportCount > 0 && (
                  <Text style={styles.previewMetaText}>
                    {selectedPlace.confidence} confidence · {selectedPlace.reportCount} {selectedPlace.reportCount === 1 ? 'report' : 'reports'}
                  </Text>
                )}
                <View style={styles.previewFreshnessRow}>
                  <View
                    style={[
                      styles.previewFreshnessDot,
                      { backgroundColor: getFreshnessColor(selectedPlace.latestCurrentReport) },
                    ]}
                  />
                  <Text style={styles.previewMetaText}>
                    {selectedPlace.latestCurrentReport
                      ? `Reported ${getAgeText(selectedPlace.latestCurrentReport.created_at)}`
                      : 'No recent report'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.previewActions}>
              <Pressable
                style={styles.secondaryAction}
                accessibilityRole="button"
                onPress={() => navigation.navigate('Place', { placeId: selectedPlace.id })}
              >
                <Ionicons name="arrow-forward-circle-outline" size={17} color={COLORS.lime} />
                <Text style={styles.secondaryActionText}>View Details</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
                accessibilityRole="button"
                disabled={openingDirections}
                onPress={() => openDirections(selectedPlace)}
              >
                <Ionicons name="navigate-outline" size={17} color={COLORS.background} />
                <Text style={styles.primaryActionText}>Directions</Text>
              </Pressable>
            </View>
            </ScrollView>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 72,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerInfo: { flex: 1, marginHorizontal: 12 },
  title: { color: COLORS.white, fontSize: 23, fontWeight: '800' },
  subtitle: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: { flex: 1, position: 'relative', overflow: 'hidden' },
  map: { flex: 1 },
  marker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  markerFrame: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#3B82F6',
    borderWidth: 3,
    borderColor: COLORS.white,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  selectedMarker: { width: 40, height: 40, borderRadius: 20, borderColor: COLORS.lime, borderWidth: 4 },
  legend: {
    position: 'absolute',
    top: 14,
    left: 14,
    maxWidth: '72%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 9 },
  legendDot: { width: 7, height: 7, borderRadius: 4, marginRight: 4 },
  legendText: { color: COLORS.muted, fontSize: 8 },
  topOverlays: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  locationBanner: {
    position: 'absolute',
    top: 58,
    left: 14,
    right: 14,
    minHeight: 57,
    padding: 10,
    borderRadius: 15,
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  locationBannerInfo: { flex: 1 },
  locationBannerTitle: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  locationBannerText: { color: COLORS.muted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  locationAction: { paddingHorizontal: 7, paddingVertical: 6, marginLeft: 6 },
  locationActionText: { color: COLORS.lime, fontSize: 10, fontWeight: '700' },
  retryMapButton: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.cardLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchAreaButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: COLORS.lime,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
  },
  searchAreaText: { color: COLORS.background, fontSize: 9, fontWeight: '800', marginLeft: 5 },
  dataNotice: {
    position: 'absolute',
    top: 122,
    left: 18,
    right: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: 'rgba(30,41,59,0.95)',
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dataNoticeText: { flex: 1, color: COLORS.muted, fontSize: 9, marginLeft: 6 },
  areaNotice: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    maxWidth: '62%',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(30,41,59,0.94)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  areaNoticeText: { color: COLORS.muted, fontSize: 8, textAlign: 'center' },
  loadingOverlay: {
    position: 'absolute',
    top: 130,
    alignSelf: 'center',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(30,41,59,0.95)',
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: { color: COLORS.white, fontSize: 9, marginLeft: 7 },
  locationButton: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: COLORS.cardLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  locationButtonRaised: { bottom: 245 },
  emptyMap: {
    position: 'absolute',
    top: '38%',
    left: 30,
    right: 30,
    alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.95)',
    padding: 22,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: { color: COLORS.white, fontSize: 13, fontWeight: '700', marginTop: 9, textAlign: 'center' },
  emptySubtitle: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: 5, textAlign: 'center' },
  previewScroll: { maxHeight: 260 },
  approximateText: { color: COLORS.orange, fontSize: 8, marginTop: 3 },
  placePreview: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center' },
  previewIcon: { width: 43, height: 43, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  previewInfo: { flex: 1 },
  previewName: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  previewCategory: { color: COLORS.lime, fontSize: 9, fontWeight: '600', marginTop: 3 },
  closePreviewButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  previewAddress: { color: COLORS.muted, fontSize: 9, lineHeight: 13, marginTop: 10 },
  previewQueueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  previewQueueMain: { flexDirection: 'row', alignItems: 'baseline' },
  previewWait: { fontSize: 20, fontWeight: '800' },
  previewLevel: { fontSize: 10, fontWeight: '700', marginLeft: 7 },
  previewMeta: { alignItems: 'flex-end' },
  previewMetaText: { color: COLORS.muted, fontSize: 8 },
  previewFreshnessRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  previewFreshnessDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  previewActions: { flexDirection: 'row', marginTop: 13 },
  secondaryAction: { flex: 1, height: 42, borderRadius: 12, backgroundColor: COLORS.cardLight, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  secondaryActionText: { color: COLORS.white, fontSize: 10, fontWeight: '700', marginLeft: 6 },
  primaryAction: { flex: 1, height: 42, borderRadius: 12, backgroundColor: COLORS.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  primaryActionText: { color: COLORS.background, fontSize: 10, fontWeight: '800', marginLeft: 6 },
  pressed: { opacity: 0.75 },
});
