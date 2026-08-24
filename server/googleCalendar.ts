import { ReplitConnectors } from "@replit/connectors-sdk";

export const FIA_EVENT_CALENDAR_ID = "c_dqk85hfnvqeoe8oqt5a6d0362o@group.calendar.google.com";
export const FIA_EVENT_CALENDAR_NAME = "FIA Event Schedule";
export const FIA_EVENT_CALENDAR_TIMEZONE = "America/New_York";
export const FIA_EVENT_CALENDAR_SUBSCRIBE_URL = `https://calendar.google.com/calendar/u/0?cid=${encodeURIComponent(Buffer.from(FIA_EVENT_CALENDAR_ID).toString("base64"))}`;

export type TrainingCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  timezone: string | null;
  location: string | null;
  description: string | null;
  htmlLink: string | null;
  meetingUrl: string | null;
  colorId: string | null;
  recurring: boolean;
};

export class GoogleCalendarError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

async function requestGoogleCalendar(path: string): Promise<Response> {
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("google-calendar", path, { method: "GET" });
  if (!response.ok) {
    let message = "Google Calendar could not be reached.";
    try {
      const body = await response.json() as { error?: { message?: string } };
      message = body.error?.message || message;
    } catch {
      // Keep the safe default message if Google's response has no JSON body.
    }
    throw new GoogleCalendarError(response.status, message);
  }
  return response;
}

export async function getTrainingCalendarEvents(
  calendarId: string,
  start: Date,
  end: Date,
  timezone: string,
): Promise<TrainingCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    timeZone: timezone,
    singleEvents: "true",
    orderBy: "startTime",
    showDeleted: "false",
    maxResults: "250",
    fields: "items(id,status,summary,description,location,start,end,htmlLink,hangoutLink,conferenceData(entryPoints(entryPointType,uri)),colorId,recurringEventId)",
  });
  const response = await requestGoogleCalendar(
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
  );
  const payload = await response.json() as {
    items?: Array<{
      id?: string;
      status?: string;
      summary?: string;
      description?: string;
      location?: string;
      start?: { dateTime?: string; date?: string; timeZone?: string };
      end?: { dateTime?: string; date?: string; timeZone?: string };
      htmlLink?: string;
      hangoutLink?: string;
      conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
      colorId?: string;
      recurringEventId?: string;
    }>;
  };

  return (payload.items || [])
    .filter((event) => event.status !== "cancelled" && !!event.id && !!event.start && !!event.end)
    .map((event) => {
      const isAllDay = !!event.start?.date;
      const meetingUrl = event.hangoutLink
        || event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri
        || null;
      return {
        id: event.id!,
        title: event.summary || "Untitled training event",
        start: event.start!.date || event.start!.dateTime!,
        end: event.end!.date || event.end!.dateTime!,
        isAllDay,
        timezone: event.start!.timeZone || event.end!.timeZone || null,
        location: event.location || null,
        description: event.description || null,
        htmlLink: event.htmlLink || null,
        meetingUrl,
        colorId: event.colorId || null,
        recurring: !!event.recurringEventId,
      };
    });
}