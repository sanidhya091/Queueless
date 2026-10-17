import React from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';

import { toCoordinate, withTimeout } from './mapPlaces';
import type { Coordinate } from './mapPlaces';

type LocationState = {
  status: 'loading' | 'ready' | 'denied' | 'blocked' | 'unavailable';
  coordinate: Coordinate | null;
  permissionGranted: boolean;
  usingLastKnown: boolean;
  unavailableReason: 'services-disabled' | 'fetch-failed' | null;
};

let permissionRequest: Promise<Location.LocationPermissionResponse> | null = null;
let positionRequest: Promise<Location.LocationObject> | null = null;

async function checkPermission(askAgain: boolean) {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.granted || !permission.canAskAgain ||
    (permission.status !== Location.PermissionStatus.UNDETERMINED && !askAgain)) {
    return permission;
  }

  // Share a pending system prompt across Strict Mode/remounts.
  if (!permissionRequest) {
    permissionRequest = Location.requestForegroundPermissionsAsync()
      .finally(() => { permissionRequest = null; });
  }
  return permissionRequest;
}

export function useMapLocation() {
  const [location, setLocation] = React.useState<LocationState>({
    status: 'loading', coordinate: null, permissionGranted: false, usingLastKnown: false,
    unavailableReason: null,
  });
  const active = React.useRef(false);
  const generation = React.useRef(0);
  const busy = React.useRef(false);

  const locate = React.useCallback(async (askAgain = false) => {
    if (busy.current || !active.current) return;
    busy.current = true;
    const request = ++generation.current;
    const current = () => active.current && request === generation.current;
    const update = (value: LocationState) => { if (current()) setLocation(value); };
    setLocation((value) => ({ ...value, status: 'loading' }));
    let granted = false;
    let lastKnown: Coordinate | null = null;

    try {
      const permission = await checkPermission(askAgain);
      if (!current()) return;
      granted = permission.granted;
      if (!granted) {
        update({
          status: permission.canAskAgain ? 'denied' : 'blocked',
          coordinate: null, permissionGranted: false, usingLastKnown: false,
          unavailableReason: null,
        });
        return;
      }

      if (!await Location.hasServicesEnabledAsync()) {
        update({ status: 'unavailable', coordinate: null,
          permissionGranted: true, usingLastKnown: false,
          unavailableReason: 'services-disabled' });
        return;
      }

      try {
        const cached = await withTimeout(Location.getLastKnownPositionAsync({
          maxAge: 2 * 60 * 1000, requiredAccuracy: 1000,
        }), 3000);
        if (cached) lastKnown = toCoordinate(cached.coords.latitude, cached.coords.longitude);
      } catch { /* A cached position is optional. */ }

      if (lastKnown) {
        update({ status: 'loading', coordinate: lastKnown,
          permissionGranted: true, usingLastKnown: true, unavailableReason: null });
      }

      if (!current()) return;
      let pendingPositionRequest = positionRequest;
      if (!pendingPositionRequest) {
        const nextPositionRequest = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          // Allow Android to offer Google Location Accuracy when the device
          // has permission but its network provider is not available.
          mayShowUserSettingsDialog: true,
        });
        const trackedPositionRequest = nextPositionRequest.finally(() => {
          if (positionRequest === trackedPositionRequest) positionRequest = null;
        });
        positionRequest = trackedPositionRequest;
        pendingPositionRequest = trackedPositionRequest;
      }
      try {
        const result = await withTimeout(pendingPositionRequest, 12000);
        const coordinate = toCoordinate(result.coords.latitude, result.coords.longitude);
        update({ status: coordinate ? 'ready' : 'unavailable', coordinate,
          permissionGranted: true, usingLastKnown: false,
          unavailableReason: coordinate ? null : 'fetch-failed' });
      } catch (error) {
        // A timeout does not cancel the native request. Do not let a stale
        // request make every later retry wait on the same unresolved promise.
        if (positionRequest === pendingPositionRequest) positionRequest = null;
        throw error;
      }
    } catch {
      update({ status: lastKnown ? 'ready' : 'unavailable', coordinate: lastKnown,
        permissionGranted: granted, usingLastKnown: Boolean(lastKnown),
        unavailableReason: lastKnown ? null : 'fetch-failed' });
    } finally {
      if (request === generation.current) busy.current = false;
    }
  }, []);

  useFocusEffect(React.useCallback(() => {
    active.current = true;
    void locate();
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && previousState === 'background') void locate();
      previousState = nextState;
    });

    return () => {
      active.current = false;
      generation.current += 1;
      busy.current = false;
      subscription.remove();
    };
  }, [locate]));

  return { ...location, locate };
}
