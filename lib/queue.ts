export const MAX_REPORT_AGE_MS = 2 * 60 * 60 * 1000;

export type QueueLevel = 'Low' | 'Moderate' | 'High';

export type Confidence = 'Low' | 'Medium' | 'High';

export type QueueReport = {
  place_id?: number;
  level: QueueLevel;
  wait_minutes: number;
  people_ahead: number | null;
  created_at: string;
};

export type QueueSummary = {
  currentReports: QueueReport[];
  latestReport: QueueReport | null;
  latestCurrentReport: QueueReport | null;
  waitMinutes: number | null;
  peopleAhead: number | null;
  queueLevel: QueueLevel | null;
  reportCount: number;
  confidence: Confidence;
};

export function isReportCurrent(
  createdAt: string,
  now = Date.now()
) {
  const createdAtMs = new Date(createdAt).getTime();

  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  const age = now - createdAtMs;

  return age >= 0 && age <= MAX_REPORT_AGE_MS;
}

export function getCurrentReports(
  reports: QueueReport[],
  now = Date.now()
) {
  return reports
    .filter((report) => isReportCurrent(report.created_at, now))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );
}

export function getLevelFromWait(
  waitMinutes: number
): QueueLevel {
  if (waitMinutes < 30) {
    return 'Low';
  }

  if (waitMinutes < 60) {
    return 'Moderate';
  }

  return 'High';
}

export function getConfidence(
  reportCount: number
): Confidence {
  if (reportCount >= 4) {
    return 'High';
  }

  if (reportCount >= 2) {
    return 'Medium';
  }

  return 'Low';
}

export function getConfidencePenalty(
  confidence: Confidence
) {
  if (confidence === 'High') {
    return 0;
  }

  if (confidence === 'Medium') {
    return 3;
  }

  return 7;
}

export function calculateQueueSummary(
  reports: QueueReport[],
  now = Date.now()
): QueueSummary {
  const sortedReports = [...reports].sort(
    (a, b) =>
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
  );

  const currentReports = getCurrentReports(reports, now);
  const latestReport = sortedReports[0] || null;
  const latestCurrentReport = currentReports[0] || null;

  if (currentReports.length === 0) {
    return {
      currentReports,
      latestReport,
      latestCurrentReport,
      waitMinutes: null,
      peopleAhead: null,
      queueLevel: null,
      reportCount: 0,
      confidence: 'Low',
    };
  }

  const waitMinutes =
    currentReports.reduce(
      (sum, report) => sum + report.wait_minutes,
      0
    ) / currentReports.length;

  const reportsWithPeople = currentReports.filter(
    (report) => report.people_ahead !== null
  );

  const peopleAhead =
    reportsWithPeople.length > 0
      ? Math.round(
          reportsWithPeople.reduce(
            (sum, report) => sum + (report.people_ahead || 0),
            0
          ) / reportsWithPeople.length
        )
      : null;

  return {
    currentReports,
    latestReport,
    latestCurrentReport,
    waitMinutes,
    peopleAhead,
    queueLevel: getLevelFromWait(waitMinutes),
    reportCount: currentReports.length,
    confidence: getConfidence(currentReports.length),
  };
}
