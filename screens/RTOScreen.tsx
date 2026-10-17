/* eslint-disable react-hooks/immutability */

import React, { useState } from 'react';



import {



  SafeAreaView,



  View,



  Text,



  StyleSheet,



  ScrollView,



  Pressable,



  Modal,



  Linking,



  Alert,



} from 'react-native';



import { Ionicons } from '@expo/vector-icons';



import { NativeStackScreenProps } from '@react-navigation/native-stack';







import { RootStackParamList } from '../App';



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







type QueueLevel = 'Low' | 'Moderate' | 'High';







type Props = NativeStackScreenProps<RootStackParamList, 'RTO'>;







const queueData = {



  Low: {



    wait: '~15 min',



    people: '8',



    color: COLORS.green,



    message: 'Short queue',



  },



  Moderate: {



    wait: '~40 min',



    people: '25',



    color: COLORS.yellow,



    message: 'Moderate queue',



  },



  High: {



    wait: '~1 hr 20 min',



    people: '60+',



    color: COLORS.red,



    message: 'Long queue',



  },



};







export default function RTOScreen({ navigation }: Props) {



  const [reportVisible, setReportVisible] = useState(false);







  React.useEffect(() => {



    async function loadLatestReport() {



      const { data, error } = await supabase



        .from('queue_reports')



        .select('*')



        .eq('place_id', 1)



        .order('created_at', { ascending: false })



        .limit(1)



        .single();







      if (error) {



        console.error('LOAD REPORT ERROR:', error);



        return;



      }







      if (!data) {



        return;



      }







      setQueueLevel(data.level as QueueLevel);



setLastUpdated(getFreshnessText(data.created_at));



    }







    loadLatestReport();



  }, []);







  const [queueLevel, setQueueLevel] =



    useState<QueueLevel>('Moderate');







  const [lastUpdated, setLastUpdated] =



    useState('Updated 8 minutes ago');







  const current = queueData[queueLevel];







  const getFreshnessText = (createdAt: string) => {



  const diffMs = Date.now() - new Date(createdAt).getTime();



  const diffMinutes = Math.floor(diffMs / 60000);







  if (diffMinutes < 1) {



    return 'Reported just now';



  }







  if (diffMinutes === 1) {



    return 'Reported 1 minute ago';



  }







  if (diffMinutes < 60) {



    return `Reported ${diffMinutes} minutes ago`;



  }







  const diffHours = Math.floor(diffMinutes / 60);







  if (diffHours === 1) {



    return 'Reported 1 hour ago';



  }







  return `Reported ${diffHours} hours ago`;



};







  const submitReport = async (level: QueueLevel) => {



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







    const { error } = await supabase



      .from('queue_reports')



      .insert({



        place_id: 1,



        level: level,



        wait_minutes: waitMinutes,



        people_ahead: peopleAhead,



      });







    if (error) {



      console.error('REPORT ERROR:', error);



      return;



    }







    setQueueLevel(level);



    setLastUpdated('Updated just now');



    setReportVisible(false);



  };







  const handleDirections = async () => {

    const destination =

      'RTO Jabalpur, Govind Bhawan, South Civil Line, Karmeta, Jabalpur, Madhya Pradesh 482002';



    const encodedDestination = encodeURIComponent(destination);



    const googleMapsAppUrl =

      `google.navigation:q=${encodedDestination}`;



    const googleMapsWebUrl =

      `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}`;



    try {

      await Linking.openURL(googleMapsAppUrl);

    } catch {

      console.log(

        'Google Maps app unavailable, opening web Maps...'

      );



      try {

        await Linking.openURL(googleMapsWebUrl);

      } catch (fallbackError) {

        console.error('MAPS ERROR:', fallbackError);



        Alert.alert(

          'Could not open Maps',

          'Please install Google Maps or open it manually.'

        );

      }

    }

  };



  return (



    <SafeAreaView style={styles.container}>



      <ScrollView



        showsVerticalScrollIndicator={false}



        contentContainerStyle={styles.content}



      >



        {/* Header */}



        <View style={styles.header}>



          <Pressable



            style={styles.backButton}



            onPress={() => navigation.goBack()}



          >



            <Ionicons



              name="arrow-back"



              size={22}



              color={COLORS.white}



            />



          </Pressable>







          <Text style={styles.headerTitle}>



            RTO Jabalpur



          </Text>







          <Pressable>



            <Ionicons



              name="bookmark-outline"



              size={22}



              color={COLORS.white}



            />



          </Pressable>



        </View>







        {/* Main Status */}



        <View style={styles.statusCard}>



          <View



            style={[



              styles.statusIcon,



              {



                backgroundColor:



                  queueLevel === 'Low'



                    ? '#19351F'



                    : queueLevel === 'High'



                    ? '#3A2020'



                    : '#3A3320',



              },



            ]}



          >



            <Ionicons



              name="car-outline"



              size={28}



              color={current.color}



            />



          </View>







          <Text style={styles.statusLabel}>



            CURRENT WAIT



          </Text>







          <Text style={styles.waitTime}>



            {current.wait}



          </Text>







          <View style={styles.statusRow}>



            <View



              style={[



                styles.queueDot,



                { backgroundColor: current.color },



              ]}



            />







            <Text



              style={[



                styles.statusText,



                { color: current.color },



              ]}



            >



              {current.message}



            </Text>



          </View>







          <Text style={styles.updated}>



            {lastUpdated}



          </Text>



        </View>







        {/* People Ahead */}



        <View style={styles.peopleCard}>



          <View>



            <Text style={styles.cardLabel}>



              PEOPLE AHEAD



            </Text>







            <Text style={styles.peopleNumber}>



              {current.people}



            </Text>



          </View>







          <View style={styles.peopleIcon}>



            <Ionicons



              name="people-outline"



              size={25}



              color={COLORS.lime}



            />



          </View>



        </View>







        {/* Action Buttons */}



        <View style={styles.actions}>



          <Pressable



            style={({ pressed }) => [



              styles.primaryButton,



              pressed && { opacity: 0.8 },



            ]}



            onPress={handleDirections}



          >



            <Ionicons



              name="navigate-outline"



              size={19}



              color={COLORS.background}



            />







            <Text style={styles.primaryText}>



              Get Directions



            </Text>



          </Pressable>







          <Pressable



            style={({ pressed }) => [



              styles.secondaryButton,



              pressed && { opacity: 0.8 },



            ]}



            onPress={() => setReportVisible(true)}



          >



            <Ionicons



              name="create-outline"



              size={19}



              color={COLORS.lime}



            />







            <Text style={styles.secondaryText}>



              Report Queue



            </Text>



          </Pressable>



        </View>







        {/* Typical Waits */}



        <Text style={styles.sectionTitle}>



          Typical wait times



        </Text>







        <View style={styles.chartCard}>



          <View style={styles.chartHeader}>



            <Text style={styles.chartTitle}>



              Today&apos;s pattern



            </Text>







            <Text style={styles.bestTime}>



              Best: 2–4 PM



            </Text>



          </View>







          <View style={styles.bars}>



            <Bar label="9 AM" height={55} />



            <Bar label="10 AM" height={80} />



            <Bar label="11 AM" height={105} />



            <Bar label="12 PM" height={125} />



            <Bar label="1 PM" height={95} />



            <Bar label="2 PM" height={45} active />



            <Bar label="3 PM" height={40} active />



            <Bar label="4 PM" height={52} />



          </View>



        </View>







        {/* Reports */}



        <Text style={styles.sectionTitle}>



          What people are saying



        </Text>







        <View style={styles.reportCard}>



          <View style={styles.reportHeader}>



            <View style={styles.avatar}>



              <Ionicons



                name="person"



                size={14}



                color={COLORS.muted}



              />



            </View>







            <View>



              <Text style={styles.reportTitle}>



                Recent report



              </Text>







              <Text style={styles.reportTime}>



                {lastUpdated.replace('Updated ', '')}



              </Text>



            </View>



          </View>







          <Text style={styles.reportText}>



            {queueLevel === 'Low'



              ? '“Queue is moving quickly right now.”'



              : queueLevel === 'High'



              ? '“Very crowded right now. Expect a long wait.”'



              : '“Queue is moving slowly, but manageable.”'}



          </Text>



        </View>



      </ScrollView>







      {/* Report Modal */}



      <Modal



        visible={reportVisible}



        transparent



        animationType="slide"



        onRequestClose={() => setReportVisible(false)}



      >



        <View style={styles.modalOverlay}>



          <View style={styles.reportModal}>



            <View style={styles.modalHandle} />







            <Text style={styles.modalTitle}>



              How&apos;s the queue right now?



            </Text>







            <Text style={styles.modalSubtitle}>



              Help others know what to expect.



            </Text>







            {/* Low */}



            <Pressable



              style={({ pressed }) => [



                styles.levelOption,



                pressed && { opacity: 0.75 },



              ]}



              onPress={() => submitReport('Low')}



            >



              <View



                style={[



                  styles.optionDot,



                  { backgroundColor: COLORS.green },



                ]}



              />







              <View style={styles.optionInfo}>



                <Text style={styles.optionTitle}>



                  Low



                </Text>







                <Text style={styles.optionSubtitle}>



                  Less than 20 min



                </Text>



              </View>







              <Ionicons



                name="chevron-forward"



                size={20}



                color={COLORS.muted}



              />



            </Pressable>







            {/* Moderate */}



            <Pressable



              style={({ pressed }) => [



                styles.levelOption,



                pressed && { opacity: 0.75 },



              ]}



              onPress={() => submitReport('Moderate')}



            >



              <View



                style={[



                  styles.optionDot,



                  { backgroundColor: COLORS.yellow },



                ]}



              />







              <View style={styles.optionInfo}>



                <Text style={styles.optionTitle}>



                  Moderate



                </Text>







                <Text style={styles.optionSubtitle}>



                  Around 20–60 min



                </Text>



              </View>







              <Ionicons



                name="chevron-forward"



                size={20}



                color={COLORS.muted}



              />



            </Pressable>







            {/* High */}



            <Pressable



              style={({ pressed }) => [



                styles.levelOption,



                pressed && { opacity: 0.75 },



              ]}



              onPress={() => submitReport('High')}



            >



              <View



                style={[



                  styles.optionDot,



                  { backgroundColor: COLORS.red },



                ]}



              />







              <View style={styles.optionInfo}>



                <Text style={styles.optionTitle}>



                  High



                </Text>







                <Text style={styles.optionSubtitle}>



                  More than 1 hour



                </Text>



              </View>







              <Ionicons



                name="chevron-forward"



                size={20}



                color={COLORS.muted}



              />



            </Pressable>







            <Pressable



              style={styles.cancelButton}



              onPress={() => setReportVisible(false)}



            >



              <Text style={styles.cancelText}>



                Cancel



              </Text>



            </Pressable>



          </View>



        </View>



      </Modal>



    </SafeAreaView>



  );



}







function Bar({



  label,



  height,



  active = false,



}: {



  label: string;



  height: number;



  active?: boolean;



}) {



  return (



    <View style={styles.barWrapper}>



      <View



        style={[



          styles.bar,



          {



            height,



            backgroundColor: active



              ? COLORS.lime



              : '#475569',



          },



        ]}



      />







      <Text style={styles.barLabel}>



        {label}



      </Text>



    </View>



  );



}







const styles = StyleSheet.create({



  container: {



    flex: 1,



    backgroundColor: COLORS.background,



  },







  content: {



    paddingHorizontal: 18,



    paddingBottom: 40,



  },







  header: {



    height: 65,



    flexDirection: 'row',



    alignItems: 'center',



    justifyContent: 'space-between',



  },







  backButton: {



    width: 40,



    height: 40,



    borderRadius: 12,



    backgroundColor: COLORS.card,



    alignItems: 'center',



    justifyContent: 'center',



  },







  headerTitle: {



    color: COLORS.white,



    fontSize: 16,



    fontWeight: '600',



  },







  statusCard: {



    backgroundColor: COLORS.card,



    borderRadius: 20,



    borderWidth: 1,



    borderColor: COLORS.border,



    alignItems: 'center',



    paddingVertical: 25,



    marginTop: 10,



  },







  statusIcon: {



    width: 58,



    height: 58,



    borderRadius: 29,



    alignItems: 'center',



    justifyContent: 'center',



    marginBottom: 13,



  },







  statusLabel: {



    color: COLORS.muted,



    fontSize: 9,



    fontWeight: '600',



    letterSpacing: 1,



  },







  waitTime: {



    color: COLORS.white,



    fontSize: 42,



    fontWeight: '700',



    marginTop: 3,



  },







  statusRow: {



    flexDirection: 'row',



    alignItems: 'center',



    marginTop: 2,



  },







  queueDot: {



    width: 7,



    height: 7,



    borderRadius: 4,



    marginRight: 6,



  },







  statusText: {



    fontSize: 12,



    fontWeight: '600',



  },







  updated: {



    color: '#64748B',



    fontSize: 9,



    marginTop: 7,



  },







  peopleCard: {



    backgroundColor: COLORS.card,



    borderRadius: 16,



    padding: 17,



    marginTop: 12,



    flexDirection: 'row',



    justifyContent: 'space-between',



    alignItems: 'center',



    borderWidth: 1,



    borderColor: COLORS.border,



  },







  cardLabel: {



    color: COLORS.muted,



    fontSize: 9,



    letterSpacing: 0.7,



    fontWeight: '600',



  },







  peopleNumber: {



    color: COLORS.white,



    fontSize: 25,



    fontWeight: '700',



    marginTop: 2,



  },







  peopleIcon: {



    width: 45,



    height: 45,



    borderRadius: 13,



    backgroundColor: '#334155',



    alignItems: 'center',



    justifyContent: 'center',



  },







  actions: {



    flexDirection: 'row',



    gap: 10,



    marginTop: 12,



  },







  primaryButton: {



    flex: 1,



    height: 48,



    borderRadius: 13,



    backgroundColor: COLORS.lime,



    flexDirection: 'row',



    alignItems: 'center',



    justifyContent: 'center',



    gap: 7,



  },







  primaryText: {



    color: COLORS.background,



    fontSize: 12,



    fontWeight: '700',



  },







  secondaryButton: {



    flex: 1,



    height: 48,



    borderRadius: 13,



    backgroundColor: COLORS.card,



    borderWidth: 1,



    borderColor: COLORS.border,



    flexDirection: 'row',



    alignItems: 'center',



    justifyContent: 'center',



    gap: 7,



  },







  secondaryText: {



    color: COLORS.lime,



    fontSize: 12,



    fontWeight: '600',



  },







  sectionTitle: {



    color: COLORS.white,



    fontSize: 15,



    fontWeight: '600',



    marginTop: 25,



    marginBottom: 10,



  },







  chartCard: {



    backgroundColor: COLORS.card,



    borderRadius: 16,



    padding: 16,



    borderWidth: 1,



    borderColor: COLORS.border,



  },







  chartHeader: {



    flexDirection: 'row',



    justifyContent: 'space-between',



  },







  chartTitle: {



    color: COLORS.white,



    fontSize: 12,



    fontWeight: '600',



  },







  bestTime: {



    color: COLORS.lime,



    fontSize: 10,



    fontWeight: '600',



  },







  bars: {



    height: 165,



    flexDirection: 'row',



    alignItems: 'flex-end',



    justifyContent: 'space-between',



    paddingTop: 20,



  },







  barWrapper: {



    alignItems: 'center',



    justifyContent: 'flex-end',



    height: 140,



  },







  bar: {



    width: 18,



    borderRadius: 5,



  },







  barLabel: {



    color: COLORS.muted,



    fontSize: 7,



    marginTop: 7,



  },







  reportCard: {



    backgroundColor: COLORS.card,



    borderRadius: 16,



    padding: 15,



    borderWidth: 1,



    borderColor: COLORS.border,



  },







  reportHeader: {



    flexDirection: 'row',



    alignItems: 'center',



  },







  avatar: {



    width: 32,



    height: 32,



    borderRadius: 16,



    backgroundColor: '#334155',



    alignItems: 'center',



    justifyContent: 'center',



    marginRight: 9,



  },







  reportTitle: {



    color: COLORS.white,



    fontSize: 11,



    fontWeight: '600',



  },







  reportTime: {



    color: COLORS.muted,



    fontSize: 8,



    marginTop: 2,



  },







  reportText: {



    color: '#CBD5E1',



    fontSize: 11,



    lineHeight: 17,



    marginTop: 12,



  },







  modalOverlay: {



    flex: 1,



    backgroundColor: 'rgba(0, 0, 0, 0.65)',



    justifyContent: 'flex-end',



  },







  reportModal: {



    backgroundColor: COLORS.card,



    borderTopLeftRadius: 25,



    borderTopRightRadius: 25,



    paddingHorizontal: 20,



    paddingTop: 10,



    paddingBottom: 30,



    borderWidth: 1,



    borderColor: COLORS.border,



  },







  modalHandle: {



    width: 42,



    height: 4,



    borderRadius: 3,



    backgroundColor: '#475569',



    alignSelf: 'center',



    marginBottom: 20,



  },







  modalTitle: {



    color: COLORS.white,



    fontSize: 20,



    fontWeight: '700',



  },







  modalSubtitle: {



    color: COLORS.muted,



    fontSize: 11,



    marginTop: 5,



    marginBottom: 18,



  },







  levelOption: {



    backgroundColor: COLORS.cardLight,



    borderWidth: 1,



    borderColor: COLORS.border,



    borderRadius: 15,



    minHeight: 65,



    flexDirection: 'row',



    alignItems: 'center',



    paddingHorizontal: 15,



    marginBottom: 10,



  },







  optionDot: {



    width: 11,



    height: 11,



    borderRadius: 6,



    marginRight: 13,



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



    height: 46,



    borderRadius: 13,



    backgroundColor: '#334155',



    alignItems: 'center',



    justifyContent: 'center',



    marginTop: 5,



  },







  cancelText: {



    color: COLORS.white,



    fontSize: 12,



    fontWeight: '600',



  },



});
