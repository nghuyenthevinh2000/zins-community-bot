import { createOpencode } from "@opencode-ai/sdk";

export interface ParsedAvailability {
  startTime: Date;
  endTime: Date;
  isVague: boolean;
  explanation?: string;
}

export interface NLUParseResult {
  success: boolean;
  parsed?: ParsedAvailability[];
  error?: string;
  isVague: boolean;
}

export class OpenCodeNLUService {
  private opencodeInstance: Promise<any>;

  constructor() {
    // run `opencode models` to find all available models
    this.opencodeInstance = createOpencode({
      config: {
        model: 'opencode/gpt-5-nano'
      }
    });
  }

  async parseAvailability(text: string, referenceDate: Date = new Date()): Promise<NLUParseResult> {
    try {
      const { client } = await this.opencodeInstance;

      const sessionRes = await client.session.create({ body: { title: "NLU parser" } });
      if (!sessionRes.data) throw new Error("No session created");
      const session = sessionRes.data;

      const promptText = `You are a natural language time parser. Extract specific date and time ranges from the user's availability text. 
              
Parse expressions like "Tuesday after 6pm", "all day Thursday", "Friday morning", "next week", etc.

Return a JSON array of time ranges with this format:
[
  {
    "startTime": "ISO 8601 datetime string",
    "endTime": "ISO 8601 datetime string",
    "explanation": "brief explanation of what was parsed"
  }
]

Rules:
- Convert relative dates (Tuesday, next week) to absolute dates based on the reference date
- If a time range is not specified, assume reasonable defaults (e.g., "morning" = 9am-12pm, "afternoon" = 12pm-6pm, "evening" = 6pm-10pm)
- "All day" means 9am to 6pm
- If the text is too vague to extract specific times, set "isVague": true inside the JSON or return an empty array
- Always return valid JSON, no markdown formatting

Reference date: ${referenceDate.toISOString()}
Text to parse: ${text}`;

      const response = await client.session.prompt({
        path: { id: session.id },
        body: {
          parts: [{ type: 'text', text: promptText }]
        }
      });

      // Cleanup session
      await client.session.delete({ path: { id: session.id } });

      console.log('Full Response:', JSON.stringify(response, null, 2));

      const parts = response.data?.parts || [];
      const textPart = parts.find((p: any) => p.type === 'text');
      let content = textPart ? textPart.text : '';

      if (!content) {
        return {
          success: false,
          error: 'No content in OpenCode response',
          isVague: true
        };
      }

      // Try to parse the JSON response
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        // If it's not valid JSON, try to extract JSON from the text
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Could not parse OpenCode response as JSON');
        }
      }

      // Check if vague
      if (parsed.isVague || (Array.isArray(parsed) && parsed.length === 0)) {
        return {
          success: true,
          parsed: [],
          isVague: true
        };
      }

      // Convert to ParsedAvailability array
      const availabilities: ParsedAvailability[] = Array.isArray(parsed)
        ? parsed.map((item: any) => ({
          startTime: new Date(item.startTime),
          endTime: new Date(item.endTime),
          isVague: false,
          explanation: item.explanation || ''
        }))
        : [];

      return {
        success: true,
        parsed: availabilities,
        isVague: availabilities.length === 0
      };

    } catch (error) {
      console.error('Error parsing availability:', error);
      throw error;
    }
  }

  async close() {
    try {
      const { server } = await this.opencodeInstance;
      if (server && typeof server.close === 'function') {
        server.close();
      }
    } catch (e) {
      // Ignore
    }
  }

  // Simple fallback parser for testing/development without API
  async parseAvailabilityFallback(text: string, referenceDate: Date = new Date()): Promise<NLUParseResult> {
    const lowerText = text.toLowerCase();
    const availabilities: ParsedAvailability[] = [];

    // Simple regex-based parsing for common patterns

    // Pattern: "Tuesday after 6pm", "Wednesday evening", "Thursday morning"
    const dayPattern = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi;
    const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayMatches = [...text.matchAll(dayPattern)];

    if (dayMatches.length > 0) {
      for (const match of dayMatches) {
        const dayName = match[1].toLowerCase();
        const targetDay = days.indexOf(dayName);

        if (targetDay !== -1) {
          const currentDay = referenceDate.getDay();
          let daysUntil = targetDay - currentDay;
          if (daysUntil < 0) daysUntil += 7;

          const targetDate = new Date(referenceDate);
          targetDate.setDate(referenceDate.getDate() + daysUntil);

          // Default times
          let startHour = 9;
          let endHour = 18;

          // Check for time qualifiers
          const textAfterDay = text.substring(match.index! + match[0].length).toLowerCase();

          if (textAfterDay.includes('morning')) {
            startHour = 9;
            endHour = 12;
          } else if (textAfterDay.includes('afternoon')) {
            startHour = 12;
            endHour = 18;
          } else if (textAfterDay.includes('evening') || textAfterDay.includes('after')) {
            startHour = 18;
            endHour = 22;
          } else if (textAfterDay.includes('all day')) {
            startHour = 9;
            endHour = 18;
          }

          const startTime = new Date(targetDate);
          startTime.setHours(startHour, 0, 0, 0);

          const endTime = new Date(targetDate);
          endTime.setHours(endHour, 0, 0, 0);

          availabilities.push({
            startTime,
            endTime,
            isVague: false,
            explanation: `${dayName} ${startHour >= 12 ? 'afternoon/evening' : 'morning'}`
          });
        }
      }
    }

    // Check for vague responses
    const vagueTerms = ['sometime', 'whenever', 'soon', 'later', 'maybe', 'not sure'];
    const isVague = vagueTerms.some(term => lowerText.includes(term)) || availabilities.length === 0;

    return {
      success: true,
      parsed: availabilities,
      isVague
    };
  }
}
