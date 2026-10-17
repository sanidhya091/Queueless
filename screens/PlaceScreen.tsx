import React from 'react';

import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  RefreshControl,
  Linking,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../App';
import { calculateQueueSummary } from '../lib/queue';
import type { QueueLevel, QueueReport } from '../lib/queue';
import {
  fetchCurrentQueueReports,
  fetchLatestQueueReport,
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
  'Place'
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

function getIcon(
  category: string
): keyof typeof Ionicons.glyphMap {
  const value = category.toLowerCase();

  if (value.includes('hospital')) {
    return 'medkit-outline';
  }

  if (value.includes('bank')) {
    return 'business-outline';
  }

  if (value.includes('government')) {
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

  if (
    value.includes('rto') ||
    value.includes('transport')
  ) {
    return 'car-outline';
  }

  if (value.includes('passport')) {
    return 'document-text-outline';
  }

  return 'business-outline';
}

function getQueueColor(level: QueueLevel) {
  if (level === 'Low') {
    return COLORS.green;
  }

  if (level === 'High') {
    return COLORS.red;
  }

  return COLORS.yellow;
}

function getQueueMessage(level: QueueLevel) {
  if (level === 'Low') {
    return 'Short queue';
  }

  if (level === 'High') {
    return 'Long queue';
  }

  return 'Moderate queue';
}

function formatWait(minutes: number) {
  const roundedMinutes = Math.round(minutes);

  if (roundedMinutes < 60) {
    return `~${roundedMinutes} min`;
  }

  const hours = Math.floor(roundedMinutes / 60);
  const remaining = roundedMinutes % 60;

  if (remaining === 0) {
    return `~${hours} hr`;
  }

  return `~${hours} hr ${remaining} min`;
}

function getAgeText(createdAt: string) {
  const diffMs = Math.max(
    0,
    Date.now() - new Date(createdAt).getTime()
  );

  const diffMinutes = Math.floor(
    diffMs / 60000
  );

  if (diffMinutes < 1) {
    return 'just now';
  }

  if (diffMinutes === 1) {
    return '1 minute ago';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  }

  const diffHours = Math.floor(
    diffMinutes / 60
  );

  if (diffHours === 1) {
    return '1 hour ago';
  }

  return `${diffHours} hours ago`;
}

function getFreshnessColor(
  createdAt: string
) {
  const age =
    Date.now() -
    new Date(createdAt).getTime();

  if (age < 30 * 60 * 1000) {
    return COLORS.green;
  }

  if (age < 60 * 60 * 1000) {
    return COLORS.yellow;
  }

  return '#F97316';
}

export default function PlaceScreen({
  navigation,
  route,
}: Props) {
  const { placeId } = route.params;

  const [place, setPlace] =
    React.useState<Place | null>(null);

  const [recentReports, setRecentReports] =
    React.useState<QueueReport[]>([]);

  const [latestOldReport, setLatestOldReport] =
    React.useState<QueueReport | null>(null);

  const [loading, setLoading] =
    React.useState(true);

  const [reportVisible, setReportVisible] =
    React.useState(false);

  const [submitting, setSubmitting] =
    React.useState(false);

  const loadPlace =
    React.useCallback(async () => {
      setLoading(true);

      try {
        const {
          data: placeData,
          error: placeError,
        } = await supabase
          .from('places')
          .select('*')
          .eq('id', placeId)
          .maybeSingle();

        if (placeError) {
          console.error(
            'LOAD PLACE ERROR:',
            placeError
          );
          return;
        }

        setPlace(
          placeData as Place | null
        );

        const now = Date.now();
        const reports = await fetchCurrentQueueReports([placeId], now);
        const summary = calculateQueueSummary(reports, now);
        setLatestOldReport(
          summary.latestReport || await fetchLatestQueueReport(placeId)
        );
        setRecentReports(reports);
      } catch (error) {
        console.error('LOAD PLACE REPORT ERROR:', error);
      } finally {
        setLoading(false);
      }
    }, [placeId]);

  React.useEffect(() => {
    // This effect starts an async data load; the loader owns its loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlace();
  }, [loadPlace]);

  const handleDirections = async () => {
    if (!place) {
      return;
    }

    let url = '';

    if (
      place.latitude !== null &&
      place.longitude !== null
    ) {
      url =
        `https://www.google.com/maps/dir/?api=1` +
        `&destination=${place.latitude},${place.longitude}`;
    } else {
      const destination =
        encodeURIComponent(
          `${place.name}, ${
            place.address || ''
          }, ${place.city}`
        );

      url =
        `https://www.google.com/maps/dir/?api=1` +
        `&destination=${destination}`;
    }

    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error(
        'OPEN DIRECTIONS ERROR:',
        error
      );
    }
  };

  const summary = calculateQueueSummary(recentReports);
  const hasRecentData = summary.reportCount > 0;
  const averageWait = summary.waitMinutes ?? 0;
  const averagePeople = summary.peopleAhead;
  const queueLevel = summary.queueLevel;

  const queueColor =
    queueLevel
      ? getQueueColor(queueLevel)
      : COLORS.muted;

  const queueMessage =
    queueLevel
      ? getQueueMessage(queueLevel)
      : 'No recent reports';

  const latestCurrentReport = summary.latestCurrentReport;

  const submitReport = async (
    level: QueueLevel
  ) => {
    setSubmitting(true);

    const waitMinutes =
      level === 'Low'
        ? 15
        : level === 'Moderate'
        ? 40
        : 80;

    const peopleAhead =
      level === 'Low'
        ? 8
        : level === 'Moderate'
        ? 25
        : 60;

    const {
      data,
      error,
    } = await supabase
      .from('queue_reports')
      .insert({
        place_id: placeId,
        level,
        wait_minutes: waitMinutes,
        people_ahead: peopleAhead,
      })
      .select(
        'level, wait_minutes, people_ahead, created_at'
      )
      .single();

    setSubmitting(false);

    if (error) {
      console.error(
        'SUBMIT PLACE REPORT ERROR:',
        error
      );
      return;
    }

    if (data) {
      const newReport =
        data as QueueReport;

      setRecentReports(
        (current) =>
          [newReport, ...current]
      );

      setLatestOldReport(
        newReport
      );
    }

    setReportVisible(false);
  };

  if (loading && !place) {
    return (
      <SafeAreaView
        style={styles.container}
      >
        <View
          style={
            styles.loadingContainer
          }
        >
          <Text
            style={styles.loadingText}
          >
            Loading place...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!place) {
    return (
      <SafeAreaView
        style={styles.container}
      >
        <View
          style={
            styles.loadingContainer
          }
        >
          <Text
            style={styles.errorTitle}
          >
            Place not found
          </Text>

          <Pressable
            style={
              styles.backButtonLarge
            }
            onPress={() =>
              navigation.goBack()
            }
          >
            <Text
              style={
                styles.backButtonText
              }
            >
              Go back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
    >
      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadPlace}
            tintColor={COLORS.lime}
            colors={[COLORS.lime]}
          />
        }
      >
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() =>
              navigation.goBack()
            }
          >
            <Ionicons
              name="arrow-back"
              size={21}
              color={COLORS.white}
            />
          </Pressable>

          <Text
            style={styles.headerTitle}
            numberOfLines={1}
          >
            {place.name}
          </Text>

          <View
            style={styles.headerSpacer}
          />
        </View>

        <View style={styles.placeCard}>
          <View style={styles.placeIcon}>
            <Ionicons
              name={getIcon(
                place.category
              )}
              size={30}
              color={COLORS.lime}
            />
          </View>

          <View style={styles.placeInfo}>
            <Text
              style={styles.placeName}
            >
              {place.name}
            </Text>

            <Text
              style={styles.category}
            >
              {place.category}
            </Text>

            <Text
              style={styles.address}
              numberOfLines={2}
            >
              {place.address ||
                place.city}
            </Text>
          </View>
        </View>

        <Text
          style={styles.sectionTitle}
        >
          Current queue
        </Text>

        <View style={styles.queueCard}>
          <View
            style={styles.queueHeader}
          >
            <View>
              <Text
                style={styles.queueLabel}
              >
                WAIT TIME
              </Text>

              <Text
                style={[
                  styles.waitTime,
                  {
                    color:
                      queueColor,
                  },
                ]}
              >
                {hasRecentData
                  ? formatWait(
                      averageWait
                    )
                  : 'No data'}
              </Text>
            </View>

            <View
              style={[
                styles.queueBadge,
                {
                  backgroundColor:
                    hasRecentData
                      ? `${queueColor}20`
                      : '#334155',
                },
              ]}
            >
              <View
                style={[
                  styles.queueDot,
                  {
                    backgroundColor:
                      queueColor,
                  },
                ]}
              />

              <Text
                style={[
                  styles.queueBadgeText,
                  {
                    color:
                      queueColor,
                  },
                ]}
              >
                {queueMessage}
              </Text>
            </View>
          </View>

          <View
            style={styles.divider}
          />

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons
                name="people-outline"
                size={20}
                color={COLORS.muted}
              />

              <View>
                <Text
                  style={
                    styles.statLabel
                  }
                >
                  PEOPLE AHEAD
                </Text>

                <Text
                  style={
                    styles.statValue
                  }
                >
                  {averagePeople ??
                    '—'}
                </Text>
              </View>
            </View>

            <View style={styles.stat}>
              <Ionicons
                name="analytics-outline"
                size={20}
                color={COLORS.muted}
              />

              <View>
                <Text
                  style={
                    styles.statLabel
                  }
                >
                  REPORTS
                </Text>

                <Text
                  style={
                    styles.statValue
                  }
                >
                  {summary.reportCount ||
                    '—'}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={
              styles.freshnessRow
            }
          >
            <View
              style={[
                styles.freshnessDot,
                {
                  backgroundColor:
                    latestCurrentReport
                      ? getFreshnessColor(
                          latestCurrentReport.created_at
                        )
                      : COLORS.muted,
                },
              ]}
            />

            <Text
              style={
                styles.freshnessText
              }
            >
              {latestCurrentReport
                ? `Latest report ${getAgeText(
                    latestCurrentReport.created_at
                  )}`
                : latestOldReport
                ? `Last report ${getAgeText(
                    latestOldReport.created_at
                  )}`
                : 'No reports yet'}
            </Text>
          </View>

          {hasRecentData && (
            <Text
              style={
                styles.consensusText
              }
            >
              Based on{' '}
              {summary.reportCount}{' '}
              recent{' '}
              {summary.reportCount ===
              1
                ? 'report'
                : 'reports'}
            </Text>
          )}
        </View>

        <View
          style={styles.actionRow}
        >
          <Pressable
            style={styles.actionButton}
            onPress={() =>
              setReportVisible(true)
            }
          >
            <Ionicons
              name="megaphone-outline"
              size={19}
              color={COLORS.lime}
            />

            <Text
              style={styles.actionText}
            >
              Report queue
            </Text>
          </Pressable>

          <Pressable
            style={styles.actionButton}
            onPress={handleDirections}
          >
            <Ionicons
              name="navigate-outline"
              size={19}
              color={COLORS.lime}
            />

            <Text
              style={styles.actionText}
            >
              Directions
            </Text>
          </Pressable>
        </View>

        <Text
          style={styles.sectionTitle}
        >
          About this place
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons
              name="location-outline"
              size={19}
              color={COLORS.muted}
            />

            <Text
              style={styles.infoText}
            >
              {place.address ||
                place.city}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons
              name="pricetag-outline"
              size={19}
              color={COLORS.muted}
            />

            <Text
              style={styles.infoText}
            >
              {place.category}
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={reportVisible}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setReportVisible(false)
        }
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          <View
            style={styles.modalCard}
          >
            <View
              style={styles.modalHandle}
            />

            <Text
              style={styles.modalTitle}
            >
              How&apos;s the queue?
            </Text>

            <Text
              style={
                styles.modalSubtitle
              }
            >
              Help others know what to
              expect.
            </Text>

            <Pressable
              disabled={submitting}
              style={
                styles.reportOption
              }
              onPress={() =>
                submitReport('Low')
              }
            >
              <View
                style={[
                  styles.optionDot,
                  {
                    backgroundColor:
                      COLORS.green,
                  },
                ]}
              />

              <View
                style={styles.optionInfo}
              >
                <Text
                  style={
                    styles.optionTitle
                  }
                >
                  Low
                </Text>

                <Text
                  style={
                    styles.optionSubtitle
                  }
                >
                  Short queue · ~15 min
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={18}
                color={COLORS.muted}
              />
            </Pressable>

            <Pressable
              disabled={submitting}
              style={
                styles.reportOption
              }
              onPress={() =>
                submitReport(
                  'Moderate'
                )
              }
            >
              <View
                style={[
                  styles.optionDot,
                  {
                    backgroundColor:
                      COLORS.yellow,
                  },
                ]}
              />

              <View
                style={styles.optionInfo}
              >
                <Text
                  style={
                    styles.optionTitle
                  }
                >
                  Moderate
                </Text>

                <Text
                  style={
                    styles.optionSubtitle
                  }
                >
                  Moderate queue · ~40 min
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={18}
                color={COLORS.muted}
              />
            </Pressable>

            <Pressable
              disabled={submitting}
              style={
                styles.reportOption
              }
              onPress={() =>
                submitReport('High')
              }
            >
              <View
                style={[
                  styles.optionDot,
                  {
                    backgroundColor:
                      COLORS.red,
                  },
                ]}
              />

              <View
                style={styles.optionInfo}
              >
                <Text
                  style={
                    styles.optionTitle
                  }
                >
                  High
                </Text>

                <Text
                  style={
                    styles.optionSubtitle
                  }
                >
                  Long queue · ~1 hr 20 min
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={18}
                color={COLORS.muted}
              />
            </Pressable>

            <Pressable
              style={
                styles.cancelButton
              }
              onPress={() =>
                setReportVisible(false)
              }
            >
              <Text
                style={styles.cancelText}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor:
      COLORS.background,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 40,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },

  loadingText: {
    color: COLORS.muted,
    fontSize: 13,
  },

  errorTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 18,
  },

  backButtonLarge: {
    backgroundColor:
      COLORS.card,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },

  backButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '600',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor:
      COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor:
      COLORS.border,
  },

  headerTitle: {
    flex: 1,
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 12,
  },

  headerSpacer: {
    width: 40,
  },

  placeCard: {
    backgroundColor:
      COLORS.cardLight,
    borderRadius: 18,
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor:
      COLORS.border,
    marginBottom: 24,
  },

  placeIcon: {
    width: 58,
    height: 58,
    borderRadius: 17,
    backgroundColor:
      '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  placeInfo: {
    flex: 1,
  },

  placeName: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '700',
  },

  category: {
    color: COLORS.lime,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
  },

  address: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 4,
  },

  sectionTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },

  queueCard: {
    backgroundColor:
      COLORS.card,
    borderRadius: 17,
    padding: 17,
    borderWidth: 1,
    borderColor:
      COLORS.border,
    marginBottom: 12,
  },

  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
  },

  queueLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.7,
  },

  waitTime: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 3,
  },

  queueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  queueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },

  queueBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },

  divider: {
    height: 1,
    backgroundColor:
      COLORS.border,
    marginVertical: 16,
  },

  statsRow: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
  },

  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  statLabel: {
    color: COLORS.muted,
    fontSize: 7,
    fontWeight: '600',
    marginLeft: 8,
  },

  statValue: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
    marginTop: 2,
  },

  freshnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },

  freshnessDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },

  freshnessText: {
    color: COLORS.muted,
    fontSize: 9,
  },

  consensusText: {
    color: '#64748B',
    fontSize: 9,
    marginTop: 5,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 24,
  },

  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 13,
    backgroundColor:
      COLORS.cardLight,
    borderWidth: 1,
    borderColor:
      COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },

  actionText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 7,
  },

  infoCard: {
    backgroundColor:
      COLORS.card,
    borderRadius: 15,
    padding: 15,
    borderWidth: 1,
    borderColor:
      COLORS.border,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 5,
  },

  infoText: {
    color: COLORS.muted,
    fontSize: 11,
    marginLeft: 10,
    flex: 1,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(0,0,0,0.65)',
    justifyContent:
      'flex-end',
  },

  modalCard: {
    backgroundColor:
      COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 25,
    borderTopWidth: 1,
    borderColor:
      COLORS.border,
  },

  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor:
      COLORS.border,
    alignSelf: 'center',
    marginBottom: 18,
  },

  modalTitle: {
    color: COLORS.white,
    fontSize: 21,
    fontWeight: '700',
  },

  modalSubtitle: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
    marginBottom: 18,
  },

  reportOption: {
    backgroundColor:
      COLORS.cardLight,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
    borderWidth: 1,
    borderColor:
      COLORS.border,
  },

  optionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },

  optionInfo: {
    flex: 1,
  },

  optionTitle: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '600',
  },

  optionSubtitle: {
    color: COLORS.muted,
    fontSize: 9,
    marginTop: 3,
  },

  cancelButton: {
    height: 45,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },

  cancelText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
});
