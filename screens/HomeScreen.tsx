import React from 'react';

import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import { RootStackParamList } from '../App';
import {
  calculateQueueSummary,
  getConfidencePenalty,
} from '../lib/queue';
import type {
  QueueLevel,
  QueueReport,
} from '../lib/queue';
import {
  fetchCurrentQueueReports,
  fetchLatestQueueReport,
  groupReportsByPlace,
} from '../lib/queueData';
import { supabase } from '../lib/supabase';

const COLORS = {
  background: '#0F172A',
  card: '#1E293B',
  cardLight: '#243552',
  lime: '#84CC16',
  green: '#22C55E',
  yellow: '#F59E0B',
  red: '#EF4444',
  white: '#F8FAFC',
  muted: '#94A3B8',
  border: '#334155',
};

type Props = NativeStackScreenProps<
  RootStackParamList,
  'Home'
>;

type Place = {
  id: number;
  name: string;
  category: string;
  address: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
};

type Office = Place & {
  waitMinutes: number | null;
  peopleAhead: number | null;
  queueLevel: QueueLevel | null;
  reportCount: number;
  confidence:
    | 'Low'
    | 'Medium'
    | 'High';
  latestReport: QueueReport | null;
};

function getQueueColor(
  level: QueueLevel
) {
  if (level === 'Low') {
    return COLORS.green;
  }

  if (level === 'High') {
    return COLORS.red;
  }

  return COLORS.yellow;
}

function getIcon(
  category: string
): keyof typeof Ionicons.glyphMap {
  const value =
    category.toLowerCase();

  if (value.includes('hospital')) {
    return 'medkit-outline';
  }

  if (value.includes('bank')) {
    return 'business-outline';
  }

  if (
    value.includes('rto') ||
    value.includes('transport')
  ) {
    return 'car-outline';
  }

  if (value.includes('passport')) {
    return 'document-text-outline';
  }

  if (
    value.includes('government')
  ) {
    return 'document-text-outline';
  }

  if (
    value.includes('college') ||
    value.includes('school')
  ) {
    return 'school-outline';
  }

  if (value.includes('railway')) {
    return 'train-outline';
  }

  return 'business-outline';
}

function formatWait(
  minutes: number | null
) {
  if (minutes === null) {
    return 'No data';
  }

  const rounded =
    Math.round(minutes);

  if (rounded < 60) {
    return `~${rounded} min`;
  }

  const hours =
    Math.floor(rounded / 60);

  const remaining =
    rounded % 60;

  if (remaining === 0) {
    return `~${hours} hr`;
  }

  return `~${hours} hr ${remaining} min`;
}

function getAgeText(
  createdAt: string
) {
  const diff =
    Math.max(
      0,
      Date.now() -
        new Date(
          createdAt
        ).getTime()
    );

  const minutes =
    Math.floor(
      diff / 60000
    );

  if (minutes < 1) {
    return 'just now';
  }

  if (minutes === 1) {
    return '1 min ago';
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours =
    Math.floor(minutes / 60);

  if (hours === 1) {
    return '1 hr ago';
  }

  return `${hours} hrs ago`;
}

function NavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.navItem}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={21}
        color={
          active
            ? COLORS.lime
            : COLORS.muted
        }
      />

      <Text
        style={[
          styles.navLabel,
          {
            color: active
              ? COLORS.lime
              : COLORS.muted,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen({
  navigation,
}: Props) {
  const [places, setPlaces] =
    React.useState<Office[]>([]);

  const [loading, setLoading] =
    React.useState(true);

  const [search, setSearch] =
    React.useState('');

  const loadPlaces =
    React.useCallback(async () => {
      setLoading(true);

      try {
        const {
          data: placeData,
          error: placeError,
        } = await supabase
          .from('places')
          .select('id, name, category, address, city, latitude, longitude')
          .order('name', {
            ascending: true,
          });

        if (placeError) {
          console.error(
            'LOAD PLACES ERROR:',
            placeError
          );
          return;
        }

        if (
          !placeData ||
          placeData.length === 0
        ) {
          setPlaces([]);
          return;
        }

        const now = Date.now();
        const allPlaces = placeData as Place[];
        const reportsByPlace = groupReportsByPlace(
          await fetchCurrentQueueReports(
            allPlaces.map((place) => place.id),
            now
          )
        );
        const result = await Promise.all(
          allPlaces.map(async (place) => {
            const summary = calculateQueueSummary(
              reportsByPlace.get(place.id) || [],
              now
            );
            let latestReport = summary.latestReport;

            if (!latestReport) {
              try {
                latestReport = await fetchLatestQueueReport(place.id);
              } catch (error) {
                console.error(`LOAD LAST REPORT FOR ${place.name}:`, error);
              }
            }

            return {
              ...place,
              waitMinutes: summary.waitMinutes,
              peopleAhead: summary.peopleAhead,
              queueLevel: summary.queueLevel,
              reportCount: summary.reportCount,
              confidence: summary.confidence,
              latestReport,
            };
          })
        );

        result.sort(
          (a, b) => {
            if (
              a.waitMinutes ===
              null
            ) {
              return 1;
            }

            if (
              b.waitMinutes ===
              null
            ) {
              return -1;
            }

            return (
              a.waitMinutes -
              b.waitMinutes
            );
          }
        );

        setPlaces(result);
      } catch (error) {
        console.error('LOAD QUEUES ERROR:', error);
      } finally {
        setLoading(false);
      }
    }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadPlaces();
    }, [loadPlaces])
  );

  const navigateToPlace = (
    office: Office
  ) => {
    navigation.navigate('Place', {
      placeId: office.id,
    });
  };

  const filteredPlaces =
    places.filter(
      (office) => {
        const query =
          search
            .trim()
            .toLowerCase();

        if (!query) {
          return true;
        }

        return (
          office.name
            .toLowerCase()
            .includes(query) ||
          office.category
            .toLowerCase()
            .includes(query) ||
          (
            office.address ||
            ''
          )
            .toLowerCase()
            .includes(query)
        );
      }
    );

  const bestRightNow =
    places
      .filter(
        (office) =>
          office.waitMinutes !==
          null
      )
      .sort(
        (a, b) => {
          const scoreA =
            (a.waitMinutes ||
              0) +
            getConfidencePenalty(
              a.confidence
            );

          const scoreB =
            (b.waitMinutes ||
              0) +
            getConfidencePenalty(
              b.confidence
            );

          return scoreA - scoreB;
        }
      )[0] || null;

  return (
    <SafeAreaView
      style={styles.container}
    >
      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadPlaces}
            tintColor={
              COLORS.lime
            }
            colors={[
              COLORS.lime,
            ]}
          />
        }
        contentContainerStyle={
          styles.content
        }
      >
        <View
          style={styles.header}
        >
          <View>
            <Text
              style={styles.logo}
            >
              Queue
              <Text
                style={
                  styles.logoAccent
                }
              >
                Less
              </Text>
            </Text>

            <Text
              style={
                styles.tagline
              }
            >
              Shorter queues. A
              smoother Jabalpur.
            </Text>
          </View>

          <Pressable
            style={
              styles.iconButton
            }
          >
            <Ionicons
              name="ellipsis-vertical"
              size={20}
              color={
                COLORS.white
              }
            />
          </Pressable>
        </View>

        <View
          style={
            styles.searchContainer
          }
        >
          <Ionicons
            name="search-outline"
            size={21}
            color={
              COLORS.muted
            }
          />

          <TextInput
            value={search}
            onChangeText={
              setSearch
            }
            placeholder="Where are you going?"
            placeholderTextColor={
              COLORS.muted
            }
            style={
              styles.searchInput
            }
          />
        </View>

        {bestRightNow && (
          <>
            <Text
              style={
                styles.sectionLabel
              }
            >
              BEST RIGHT NOW
            </Text>

            <Pressable
              style={
                styles.bestCard
              }
              onPress={() =>
                navigateToPlace(
                  bestRightNow
                )
              }
            >
              <View
                style={
                  styles.starCircle
                }
              >
                <Ionicons
                  name="star"
                  size={18}
                  color={
                    COLORS.lime
                  }
                />
              </View>

              <View
                style={
                  styles.bestInfo
                }
              >
                <Text
                  style={
                    styles.bestName
                  }
                >
                  {
                    bestRightNow.name
                  }
                </Text>

                <View
                  style={
                    styles.waitRow
                  }
                >
                  <View
                    style={[
                      styles.greenDot,
                      {
                        backgroundColor:
                          getQueueColor(
                            bestRightNow.queueLevel ||
                              'Low'
                          ),
                      },
                    ]}
                  />

                  <Text
                    style={
                      styles.bestWait
                    }
                  >
                    {formatWait(
                      bestRightNow.waitMinutes
                    )}
                  </Text>
                </View>

                <Text
                  style={
                    styles.bestSubtext
                  }
                >
                  {bestRightNow.confidence}{' '}
                  confidence ·{' '}
                  {
                    bestRightNow.reportCount
                  }{' '}
                  reports
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={
                  COLORS.muted
                }
              />
            </Pressable>
          </>
        )}

        <View
          style={
            styles.nearbyHeader
          }
        >
          <Text
            style={
              styles.nearbyTitle
            }
          >
            Nearby offices
          </Text>

          <Text
            style={
              styles.sortText
            }
          >
            {filteredPlaces.length}{' '}
            places
          </Text>
        </View>

        {filteredPlaces.length ===
        0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Ionicons
              name="search-outline"
              size={28}
              color={
                COLORS.muted
              }
            />

            <Text
              style={
                styles.emptyTitle
              }
            >
              No places found
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Try a different
              search.
            </Text>
          </View>
        ) : (
          filteredPlaces.map(
            (office) => {
              const color =
                office.queueLevel
                  ? getQueueColor(
                      office.queueLevel
                    )
                  : COLORS.muted;

              return (
                <Pressable
                  key={
                    office.id
                  }
                  style={
                    styles.officeCard
                  }
                  onPress={() =>
                    navigateToPlace(
                      office
                    )
                  }
                >
                  <View
                    style={
                      styles.officeIcon
                    }
                  >
                    <Ionicons
                      name={getIcon(
                        office.category
                      )}
                      size={22}
                      color={
                        COLORS.lime
                      }
                    />
                  </View>

                  <View
                    style={
                      styles.officeInfo
                    }
                  >
                    <Text
                      style={
                        styles.officeName
                      }
                      numberOfLines={
                        1
                      }
                    >
                      {
                        office.name
                      }
                    </Text>

                    <Text
                      style={
                        styles.officeCategory
                      }
                    >
                      {
                        office.category
                      }
                    </Text>

                    <View
                      style={
                        styles.officeMeta
                      }
                    >
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor:
                              color,
                          },
                        ]}
                      />

                      <Text
                        style={[
                          styles.officeWait,
                          {
                            color,
                          },
                        ]}
                      >
                        {formatWait(
                          office.waitMinutes
                        )}
                      </Text>

                      <Text
                        style={
                          styles.updated
                        }
                      >
                        {office.latestReport
                          ? `· ${getAgeText(
                              office.latestReport
                                .created_at
                            )}`
                          : '· No reports'}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.confidenceBox
                    }
                  >
                    <Text
                      style={
                        styles.confidenceText
                      }
                    >
                      {
                        office.confidence
                      }
                    </Text>

                    <Ionicons
                      name="chevron-forward"
                      size={17}
                      color={
                        COLORS.muted
                      }
                    />
                  </View>
                </Pressable>
              );
            }
          )
        )}
      </ScrollView>

      <View
        style={styles.bottomNav}
      >
        <NavItem
          icon="home"
          label="Home"
          active
          onPress={() =>
            navigation.navigate(
              'Home'
            )
          }
        />

        <NavItem
          icon="map-outline"
          label="Map"
          onPress={() =>
            navigation.navigate(
              'Map'
            )
          }
        />

        <NavItem
          icon="time-outline"
          label="History"
          onPress={() => {}}
        />

        <NavItem
          icon="person-outline"
          label="Profile"
          onPress={() => {}}
        />
      </View>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        COLORS.background,
    },

    content: {
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 110,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 20,
    },

    logo: {
      color: COLORS.white,
      fontSize: 27,
      fontWeight: '800',
      letterSpacing: -1,
    },

    logoAccent: {
      color: COLORS.lime,
    },

    tagline: {
      color: COLORS.muted,
      fontSize: 10,
      marginTop: 3,
    },

    iconButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor:
        COLORS.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor:
        COLORS.border,
    },

    searchContainer: {
      height: 52,
      backgroundColor:
        COLORS.card,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        COLORS.border,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 15,
      marginBottom: 22,
    },

    searchInput: {
      flex: 1,
      color: COLORS.white,
      fontSize: 13,
      marginLeft: 10,
    },

    sectionLabel: {
      color: COLORS.muted,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
      marginBottom: 9,
    },

    bestCard: {
      backgroundColor:
        COLORS.cardLight,
      borderRadius: 18,
      padding: 15,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor:
        COLORS.border,
      marginBottom: 26,
    },

    starCircle: {
      width: 45,
      height: 45,
      borderRadius: 14,
      backgroundColor:
        '#334155',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 13,
    },

    bestInfo: {
      flex: 1,
    },

    bestName: {
      color: COLORS.white,
      fontSize: 14,
      fontWeight: '700',
    },

    waitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 5,
    },

    greenDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      marginRight: 6,
    },

    bestWait: {
      color: COLORS.white,
      fontSize: 12,
      fontWeight: '700',
    },

    bestSubtext: {
      color: COLORS.muted,
      fontSize: 9,
      marginTop: 4,
    },

    nearbyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 10,
    },

    nearbyTitle: {
      color: COLORS.white,
      fontSize: 15,
      fontWeight: '700',
    },

    sortText: {
      color: COLORS.muted,
      fontSize: 9,
    },

    officeCard: {
      backgroundColor:
        COLORS.card,
      borderRadius: 16,
      padding: 13,
      marginBottom: 9,
      borderWidth: 1,
      borderColor:
        COLORS.border,
      flexDirection: 'row',
      alignItems: 'center',
    },

    officeIcon: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor:
        '#334155',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },

    officeInfo: {
      flex: 1,
    },

    officeName: {
      color: COLORS.white,
      fontSize: 12,
      fontWeight: '700',
    },

    officeCategory: {
      color: COLORS.muted,
      fontSize: 9,
      marginTop: 3,
    },

    officeMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
    },

    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 5,
    },

    officeWait: {
      fontSize: 10,
      fontWeight: '700',
    },

    updated: {
      color: COLORS.muted,
      fontSize: 8,
      marginLeft: 4,
    },

    confidenceBox: {
      alignItems: 'flex-end',
      justifyContent:
        'center',
      marginLeft: 8,
    },

    confidenceText: {
      color: COLORS.muted,
      fontSize: 8,
      marginBottom: 5,
    },

    emptyCard: {
      backgroundColor:
        COLORS.card,
      borderRadius: 17,
      padding: 30,
      alignItems: 'center',
      borderWidth: 1,
      borderColor:
        COLORS.border,
    },

    emptyTitle: {
      color: COLORS.white,
      fontSize: 14,
      fontWeight: '700',
      marginTop: 10,
    },

    emptyText: {
      color: COLORS.muted,
      fontSize: 10,
      marginTop: 4,
    },

    bottomNav: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 10,
      height: 65,
      borderRadius: 20,
      backgroundColor:
        COLORS.card,
      borderWidth: 1,
      borderColor:
        COLORS.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-around',
      paddingHorizontal: 5,
    },

    navItem: {
      flex: 1,
      height: 55,
      alignItems: 'center',
      justifyContent: 'center',
    },

    navLabel: {
      fontSize: 8,
      fontWeight: '600',
      marginTop: 4,
    },
  });
