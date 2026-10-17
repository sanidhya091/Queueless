import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from './screens/HomeScreen';
import RTOScreen from './screens/RTOScreen';
import PlaceScreen from './screens/PlaceScreen';
import MapScreen from './screens/MapScreen';

export type RootStackParamList = {
  Home: undefined;
  RTO: undefined;
  Place: {
    placeId: number;
  };
  Map: undefined;
};

const Stack =
  createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
          />

          <Stack.Screen
            name="RTO"
            component={RTOScreen}
          />

          <Stack.Screen
            name="Place"
            component={PlaceScreen}
          />

          <Stack.Screen
            name="Map"
            component={MapScreen}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
